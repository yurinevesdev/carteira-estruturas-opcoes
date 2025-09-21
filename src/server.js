const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const fs = require('fs');
const logger = require('./logger');
const { getOptionPrice, getAssetPrice } = require('./scraper.js');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rota explícita para servir o index.html na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const dbPath = path.join(__dirname, '..', 'data', 'dados.json');

app.get('/api/preco-ativo/:ticker', async (req, res) => {
  const { ticker } = req.params;
  logger.info(`Recebida requisição de preço para a ação: ${ticker}`);
  const preco = await getAssetPrice(ticker);
  if (preco !== null) {
    res.json({ ticker, preco });
  } else {
    res.status(404).json({ error: `Preço não encontrado para ${ticker}` });
  }
});

app.get('/api/preco/opcao/:ativo/:opcao', async (req, res) => {
  const { ativo, opcao } = req.params;
  logger.info(`Recebida requisição de preço para a opção: ${opcao}`);
  const preco = await getOptionPrice(opcao);
  if (preco !== null) {
    res.json({ ativo, opcao, preco });
  } else {
    res.status(404).json({ error: `Preço não encontrado para ${opcao}` });
  }
});

app.get('/api/dados', (req, res) => {
  fs.readFile(dbPath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        logger.warn(`Arquivo de dados (${dbPath}) não encontrado. Retornando dados vazios.`);
        return res.json({ operacoes: [], lancamentos: [], proximoId: 1 });
      }
      logger.error(`Erro ao ler o arquivo de dados: ${err}`);
      return res.status(500).send('Error reading data file.');
    }
    logger.info('Dados lidos com sucesso.');
    res.send(data);
  });
});

app.post('/api/dados', (req, res) => {
  const { operacoes, lancamentos, proximoId } = req.body;

  // Calcula o resultado de cada lançamento
  const lancamentosAtualizados = lancamentos.map(lanc => {
    let resultado = 0;
    if (lanc.precoSaida && lanc.precoSaida > 0) {
      if (lanc.operacao === 'COMPRA') {
        resultado = (lanc.precoSaida - lanc.precoEntrada) * lanc.quantidade;
      } else { // VENDA
        resultado = (lanc.precoEntrada - lanc.precoSaida) * lanc.quantidade;
      }
    }
    return { ...lanc, resultado };
  });

  const data = JSON.stringify({ operacoes, lancamentos: lancamentosAtualizados, proximoId }, null, 2);

  fs.writeFile(dbPath, data, 'utf8', (err) => {
    if (err) {
      logger.error(`Erro ao salvar o arquivo de dados: ${err}`);
      return res.status(500).send('Error writing data file.');
    }
    logger.info('Dados salvos com sucesso.');
    res.send({ message: 'Data saved successfully!' });
  });
});

app.listen(port, () => {
  logger.info(`Servidor iniciado e ouvindo em http://localhost:${port}`);
});