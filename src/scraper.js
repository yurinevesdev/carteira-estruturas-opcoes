const axios = require('axios');
const logger = require('./logger'); // Importa o logger

const accessToken = process.env.OPLAB_ACCESS_TOKEN;

if (!accessToken) {
    logger.error('Crítico: OPLAB_ACCESS_TOKEN não encontrado. Verifique seu arquivo .env.');
    throw new Error('Crítico: OPLAB_ACCESS_TOKEN não encontrado. Verifique seu arquivo .env.');
}

const apiClient = axios.create({
    baseURL: 'https://api.oplab.com.br/v3/market',
    headers: {
        'Access-Token': accessToken
    }
});

async function getOptionData(optionSymbol) {
    if (!optionSymbol) {
        logger.error("Símbolo da opção não fornecido para getOptionData.");
        return null;
    }

    try {
        logger.info(`[API] Buscando dados para a opção: ${optionSymbol}`);
        const response = await apiClient.get(`/options/details/${optionSymbol.toUpperCase()}`);
        
        if (!response.data) {
            logger.warn(`Nenhum dado retornado da API para ${optionSymbol}`);
            return null;
        }
        
        logger.info(`[API] Dados encontrados para ${optionSymbol}`);
        return response.data;

    } catch (error) {
        handleApiError(error, optionSymbol);
        return null;
    }
}

async function getAssetPrice(ticker) {
    if (!ticker) {
        logger.error("Ticker do ativo não fornecido para getAssetPrice.");
        return null;
    }

    try {
        logger.info(`[API] Buscando preço para a ação: ${ticker}`);
        const response = await apiClient.get(`/stocks/${ticker.toUpperCase()}`);
        const price = response.data?.close;

        if (price === undefined || price === null) {
            logger.warn(`Preço 'close' não encontrado no retorno da API para ${ticker}`);
            return null;
        }

        logger.info(`[API] Preço encontrado para ${ticker}: R$ ${price}`);
        return price;

    } catch (error) {
        handleApiError(error, ticker);
        return null;
    }
}

function handleApiError(error, symbol) {
    if (error.response) {
        logger.error(`Erro da API ao buscar ${symbol}: Status ${error.response.status} - Dados: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
        logger.error(`Erro de rede: Não foi possível conectar à API para buscar ${symbol}`);
    } else {
        logger.error(`Erro ao processar a chamada da API para ${symbol}: ${error.message}`);
    }
}

module.exports = { getOptionData, getAssetPrice };
