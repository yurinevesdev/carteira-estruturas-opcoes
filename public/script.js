let operacoes = [];
let lancamentos = [];
let proximoId = 1;
let operacoesFiltradas = [];

let config = {
    autoBackupInterval: 25,
    moedaPadrao: 'BRL',
    ultimoBackup: null
};

function calcularResultadoLancamento(lanc) {
    const { precoEntrada, precoSaida, quantidade, operacao } = lanc;

    // Se não houver preço de saída, a operação está aberta
    if (!precoSaida || precoSaida === 0) {
        if (operacao === 'COMPRA') {
            // É um custo, então o valor é negativo
            return -(precoEntrada * quantidade);
        } else { // VENDA
            // É um crédito, então o valor é positivo
            return precoEntrada * quantidade;
        }
    } else { // Operação fechada
        if (operacao === 'COMPRA') {
            // Lucro/Prejuízo de uma compra
            return (precoSaida - precoEntrada) * quantidade;
        } else { // VENDA
            // Lucro/Prejuízo de uma venda a descoberto
            return (precoEntrada - precoSaida) * quantidade;
        }
    }
}

function calcularTodosResultados() {
    if (!lancamentos) return;
    lancamentos.forEach(lanc => {
        lanc.resultado = calcularResultadoLancamento(lanc);
    });
}

async function carregarDados() {
    try {
        const response = await fetch('/api/dados');
        const data = await response.json();

        console.log("Dados recebidos de /api/dados:", data);

        operacoes = data.operacoes || [];
        lancamentos = data.lancamentos || [];
        proximoId = data.proximoId || 1;

        calcularTodosResultados();

        const hoje = new Date().toISOString().split('T')[0];
        document.getElementById('dataEntrada').value = hoje;

        atualizarTabelas();
        atualizarEstatisticas();
        atualizarDashboard();
        atualizarSelectEstruturas();
        verificarAutoBackup();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Não foi possível carregar os dados do servidor.');
    }
}

async function salvarDados() {
    try {
        const dados = {
            operacoes: operacoes,
            lancamentos: lancamentos,
            proximoId: proximoId
        };

        await fetch('/api/dados', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

    } catch (error) {
        console.error('Erro ao salvar dados:', error);
        alert('Não foi possível salvar os dados no servidor.');
    }
}

function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));

    document.getElementById(tabName).classList.add('active');
    document.querySelector(`.nav-item[data-tab=${tabName}]`).classList.add('active');

    if (tabName === 'dashboard') {
        atualizarDashboard();
    }
}

document.getElementById('formOperacao').addEventListener('submit', function (e) {
    e.preventDefault();

    const operacao = {
        id: proximoId++,
        estrutura: proximoId - 1,
        dataEntrada: document.getElementById('dataEntrada').value,
        estrategia: document.getElementById('estrategia').value,
        ativo: document.getElementById('ativo').value.toUpperCase(),
        dataSaida: document.getElementById('dataSaida').value,
        observacoes: document.getElementById('observacoes').value
    };

    operacoes.push(operacao);
    salvarDados();
    atualizarTabelas();
    atualizarEstatisticas();
    atualizarDashboard();
    atualizarSelectEstruturas();
    limparFormOperacao();

    alert('✅ Operação salva com sucesso!');
    verificarAutoBackup();
});

document.getElementById('formLancamento').addEventListener('submit', async function (e) { // made async
    e.preventDefault();

    const ativo = document.getElementById('ativoLancamento').value.toUpperCase();
    if (!ativo) {
        alert('Por favor, insira o código do ativo.');
        return;
    }

    try {
        // 1. Fetch option details from the backend
        const response = await fetch(`/api/option-details/${ativo}`);
        if (!response.ok) {
            throw new Error(`Não foi possível encontrar os detalhes para a opção ${ativo}. Verifique o código.`);
        }
        const optionData = await response.json();

        // 2. Build the 'lancamento' object with API data AND manual data
        const precoEntrada = parseFloat(document.getElementById('precoEntrada').value); // READ FROM INPUT
        const quantidade = parseInt(document.getElementById('quantidade').value);
        const editandoIndex = document.getElementById('editandoIndex').value;

        const lancamento = {
            estruturaId: parseInt(document.getElementById('estruturaId').value),
            ativo: ativo,
            tipo: optionData.category, // from API
            operacao: document.getElementById('operacao').value,
            strike: parseFloat(optionData.strike) || 0, // from API
            vencimento: optionData.due_date.split('T')[0], // from API
            quantidade: quantidade,
            precoEntrada: precoEntrada, // from INPUT
            precoSaida: 0, 
            resultado: 0 
        };
        
        lancamento.resultado = calcularResultadoLancamento(lancamento);

        // 3. Save data (existing logic)
        if (editandoIndex !== '') {
            lancamentos[parseInt(editandoIndex)] = lancamento;
            cancelarEdicaoLancamento();
            alert('✅ Lançamento atualizado com sucesso!');
        } else {
            lancamentos.push(lancamento);
            limparFormLancamento();
            alert('✅ Lançamento salvo com sucesso!');
        }

        salvarDados();
        atualizarTabelas();
        atualizarEstatisticas();
        atualizarDashboard();

    } catch (error) {
        console.error('Erro ao salvar lançamento:', error);
        alert(error.message);
    }
});

function calcularResultadoOperacao(operacaoId) {
    return lancamentos
        .filter(lanc => lanc.estruturaId === operacaoId)
        .reduce((total, lanc) => total + lanc.resultado, 0);
}

async function fetchAndUpdateAcaoPrice(lancamento, index) {
    if (lancamento.tipo !== 'AÇÃO' || lancamento.precoSaida !== 0) {
        return;
    }

    const precoAtualCell = document.getElementById(`preco-atual-lanc-${index}`);
    const resultadoAbertoCell = document.getElementById(`resultado-aberto-lanc-${index}`);

    try {
        const response = await fetch(`/api/preco-ativo/${lancamento.ativo}`);
        const data = await response.json();

        if (data.preco) {
            const precoAtual = data.preco;

            let resultadoAberto = 0;
            if (lancamento.operacao === 'COMPRA') {
                resultadoAberto = (precoAtual - lancamento.precoEntrada) * lancamento.quantidade;
            } else { // VENDA
                resultadoAberto = (lancamento.precoEntrada - precoAtual) * lancamento.quantidade;
            }

            precoAtualCell.textContent = `R$ ${precoAtual.toFixed(2)}`;
            resultadoAbertoCell.innerHTML = `<strong style="color: ${resultadoAberto >= 0 ? 'blue' : 'red'};">R$ ${resultadoAberto.toFixed(2)}</strong>`;
        } else {
            precoAtualCell.textContent = 'N/A';
            resultadoAbertoCell.textContent = '-';
            console.warn(data.error || `Preço não encontrado para ${lancamento.ativo}.`);
        }
    } catch (error) {
        console.error(`Falha ao buscar preço para ${lancamento.ativo}:`, error);
        precoAtualCell.textContent = 'Erro';
        resultadoAbertoCell.textContent = '-';
    }
}

async function fetchAndUpdateOptionPrice(lancamento, operacaoPai, index) {
    const isOption = lancamento.tipo === 'CALL' || lancamento.tipo === 'PUT';

    if (!isOption || lancamento.precoSaida !== 0 || !operacaoPai) {
        return;
    }

    const precoAtualCell = document.getElementById(`preco-atual-lanc-${index}`);
    const resultadoAbertoCell = document.getElementById(`resultado-aberto-lanc-${index}`);

    try {
        const response = await fetch(`/api/preco/opcao/${operacaoPai.ativo}/${lancamento.ativo}`);
        const data = await response.json();

        if (data.preco) {
            const precoAtual = data.preco;
            let resultadoAberto = 0;
            if (lancamento.operacao === 'COMPRA') {
                resultadoAberto = (precoAtual - lancamento.precoEntrada) * lancamento.quantidade;
            } else { // VENDA
                resultadoAberto = (lancamento.precoEntrada - precoAtual) * lancamento.quantidade;
            }

            precoAtualCell.textContent = `R$ ${precoAtual.toFixed(2)}`;
            resultadoAbertoCell.innerHTML = `<strong style="color: ${resultadoAberto >= 0 ? 'blue' : 'red'};">R$ ${resultadoAberto.toFixed(2)}</strong>`;
        } else {
            precoAtualCell.textContent = 'N/A';
            resultadoAbertoCell.textContent = '-';
            console.warn(data.error || `Preço não encontrado para ${lancamento.ativo}`);
        }
    } catch (error) {
        console.error(`Falha ao buscar preço para ${lancamento.ativo}:`, error);
        precoAtualCell.textContent = 'Erro';
        resultadoAbertoCell.textContent = '-';
    }
}

function atualizarTabelas() {
    operacoesFiltradas = operacoes;
    aplicarFiltros();

    const tabelaOperacoes = document.getElementById('tabelaOperacoes');
    tabelaOperacoes.innerHTML = '';

    operacoesFiltradas.forEach(op => {
        const resultadoTotal = calcularResultadoOperacao(op.id);
        const row = tabelaOperacoes.insertRow();

        if (resultadoTotal > 0) {
            row.classList.add('tr-positive');
        } else if (resultadoTotal < 0) {
            row.classList.add('tr-negative');
        }

        const performance = resultadoTotal > 0 ?
            `<span class="performance-indicator performance-positive">LUCRO</span>` :
            resultadoTotal < 0 ?
                `<span class="performance-indicator performance-negative">PREJUÍZO</span>` :
                `<span class="performance-indicator">NEUTRO</span>`;

        row.innerHTML = `
            <td>${op.id}</td>
            <td>${formatarData(op.dataEntrada)}</td>
            <td>${op.estrategia}</td>
            <td>${op.ativo}</td>
            <td>${op.dataSaida ? formatarData(op.dataSaida) : '<em style="color: orange;">Aberta</em>'}</td>
            <td><strong>R$ ${resultadoTotal.toFixed(2)}</strong></td>
            <td>${performance}</td>
            <td>${op.observacoes || '-'}</td>
            <td class="actions">
                <button class="btn btn-small btn-warning" data-action="editar-operacao" data-id="${op.id}" title="Editar">✏️</button>
                <button class="btn btn-small btn-danger" data-action="excluir-operacao" data-id="${op.id}" title="Excluir">🗑️</button>
                <button class="btn btn-small btn-info" data-action="ver-detalhes" data-id="${op.id}" title="Detalhes">👁️</button>
            </td>
        `;
    });

    const tabelaLancamentos = document.getElementById('tabelaLancamentos');
    tabelaLancamentos.innerHTML = '';

    lancamentos.forEach((lanc, index) => {
        const operacaoPai = operacoes.find(op => op.id === lanc.estruturaId);
        const row = tabelaLancamentos.insertRow();

        if (lanc.resultado > 0) {
            row.classList.add('tr-positive');
        } else if (lanc.resultado < 0) {
            row.classList.add('tr-negative');
        }

        const isOption = lanc.tipo === 'CALL' || lanc.tipo === 'PUT';
        const isAcao = lanc.tipo === 'AÇÃO';
        const isAberto = lanc.precoSaida === 0;

        row.innerHTML = `
            <td>${lanc.estruturaId}</td>
            <td>${lanc.ativo}</td>
            <td>${lanc.tipo}</td>
            <td>${lanc.operacao}</td>
            <td>${lanc.strike || '-'}</td>
            <td>${lanc.vencimento ? formatarData(lanc.vencimento) : '-'}</td>
            <td>${lanc.quantidade}</td>
            <td>R$ ${lanc.precoEntrada.toFixed(2)}</td>
            
            <td id="preco-atual-lanc-${index}">${(isAberto && (isOption || isAcao)) ? 'Buscando...' : '-'}</td>
            <td id="resultado-aberto-lanc-${index}">${(isAberto && (isOption || isAcao)) ? 'Calculando...' : '-'}</td>
            
            <td>R$ ${lanc.precoSaida.toFixed(2)}</td>
            <td><strong>R$ ${lanc.resultado.toFixed(2)}</strong></td>
            <td class="actions">
                <button class="btn btn-small btn-warning" data-action="editar-lancamento" data-index="${index}" title="Editar">✏️</button>
                <button class="btn btn-small btn-danger" data-action="excluir-lancamento" data-index="${index}" title="Excluir">🗑️</button>
            </td>
        `;

        if (isAberto) {
            if (isAcao) {
                fetchAndUpdateAcaoPrice(lanc, index);
            }
            if (isOption) {
                fetchAndUpdateOptionPrice(lanc, operacaoPai, index);
            }
        }
    });
}

function aplicarFiltros() {
    const filtroEstrategia = document.getElementById('filtroEstrategia').value;
    const filtroAtivo = document.getElementById('filtroAtivo').value.toUpperCase();
    const filtroStatus = document.getElementById('filtroStatus').value;

    operacoesFiltradas = operacoes.filter(op => {
        let passa = true;

        if (filtroEstrategia && op.estrategia !== filtroEstrategia) {
            passa = false;
        }

        if (filtroAtivo && !op.ativo.includes(filtroAtivo)) {
            passa = false;
        }

        if (filtroStatus === 'aberta' && op.dataSaida) {
            passa = false;
        }

        if (filtroStatus === 'fechada' && !op.dataSaida) {
            passa = false;
        }

        return passa;
    });

    const tabelaOperacoes = document.getElementById('tabelaOperacoes');
    tabelaOperacoes.innerHTML = '';

    operacoesFiltradas.forEach(op => {
        const resultadoTotal = calcularResultadoOperacao(op.id);
        const row = tabelaOperacoes.insertRow();

        if (resultadoTotal > 0) {
            row.classList.add('tr-positive');
        } else if (resultadoTotal < 0) {
            row.classList.add('tr-negative');
        }

        const performance = resultadoTotal > 0 ?
            `<span class="performance-indicator performance-positive">LUCRO</span>` :
            resultadoTotal < 0 ?
                `<span class="performance-indicator performance-negative">PREJUÍZO</span>` :
                `<span class="performance-indicator">NEUTRO</span>`;

        row.innerHTML = `
            <td>${op.id}</td>
            <td>${formatarData(op.dataEntrada)}</td>
            <td>${op.estrategia}</td>
            <td>${op.ativo}</td>
            <td>${op.dataSaida ? formatarData(op.dataSaida) : '<em style="color: orange;">Aberta</em>'}</td>
            <td><strong>R$ ${resultadoTotal.toFixed(2)}</strong></td>
            <td>${performance}</td>
            <td>${op.observacoes || '-'}</td>
            <td class="actions">
                <button class="btn btn-small btn-warning" data-action="editar-operacao" data-id="${op.id}" title="Editar">✏️</button>
                <button class="btn btn-small btn-danger" data-action="excluir-operacao" data-id="${op.id}" title="Excluir">🗑️</button>
                <button class="btn btn-small btn-info" data-action="ver-detalhes" data-id="${op.id}" title="Detalhes">👁️</button>
            </td>
        `;
    });
}

function editarLancamento(index) {
    const lanc = lancamentos[index];

    document.getElementById('editandoIndex').value = index;
    document.getElementById('estruturaId').value = lanc.estruturaId;
    document.getElementById('ativoLancamento').value = lanc.ativo;
    document.getElementById('tipo').value = lanc.tipo;
    document.getElementById('operacao').value = lanc.operacao;
    document.getElementById('strike').value = lanc.strike || '';
    document.getElementById('vencimento').value = lanc.vencimento || '';
    document.getElementById('quantidade').value = lanc.quantidade;
    document.getElementById('precoEntrada').value = lanc.precoEntrada;
    document.getElementById('precoSaida').value = lanc.precoSaida;

    document.getElementById('tituloFormLancamento').textContent = 'Editar Lançamento';
    document.getElementById('btnSalvarLancamento').textContent = 'Atualizar Lançamento';
    document.getElementById('btnSalvarLancamento').className = 'btn btn-warning';

    document.getElementById('formLancamento').scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoLancamento() {
    document.getElementById('editandoIndex').value = '';
    document.getElementById('tituloFormLancamento').textContent = 'Novo Lançamento';
    document.getElementById('btnSalvarLancamento').textContent = 'Salvar Lançamento';
    document.getElementById('btnSalvarLancamento').className = 'btn btn-success';
    limparFormLancamento();
}

function editarOperacao(id) {
    const operacao = operacoes.find(op => op.id === id);
    if (!operacao) return;

    document.getElementById('dataEntrada').value = operacao.dataEntrada;
    document.getElementById('estrategia').value = operacao.estrategia;
    document.getElementById('ativo').value = operacao.ativo;
    document.getElementById('dataSaida').value = operacao.dataSaida || '';
    document.getElementById('observacoes').value = operacao.observacoes || '';

    operacoes = operacoes.filter(op => op.id !== id);

    showTab('operacoes');
    document.getElementById('formOperacao').scrollIntoView({ behavior: 'smooth' });
}

function verDetalhesOperacao(id) {
    const operacao = operacoes.find(op => op.id === id);
    const lancamentosOperacao = lancamentos.filter(lanc => lanc.estruturaId === id);
    const resultado = calcularResultadoOperacao(id);

    let detalhes = `
        <h4>Operação #${operacao.id} - ${operacao.ativo}</h4>
        <p><strong>Estratégia:</strong> ${operacao.estrategia}</p>
        <p><strong>Data Entrada:</strong> ${formatarData(operacao.dataEntrada)}</p>
        <p><strong>Data Saída:</strong> ${operacao.dataSaida ? formatarData(op.dataSaida) : 'Operação ainda aberta'}</p>
        <p><strong>Resultado Total:</strong> <span style="color: ${resultado >= 0 ? 'green' : 'red'}; font-weight: bold;">R$ ${resultado.toFixed(2)}</span></p>
        <p><strong>Observações:</strong> ${op.observacoes || 'Nenhuma observação'}</p>
        <hr>
        <h5>Lançamentos (${lancamentosOperacao.length}):</h5>
    `;

    if (lancamentosOperacao.length === 0) {
        detalhes += '<p>Nenhum lançamento cadastrado para esta operação.</p>';
    } else {
        detalhes += '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">';
        detalhes += '<tr style="background: #f0f0f0;"><th style="padding: 8px; border: 1px solid #ddd;">Ativo</th><th style="padding: 8px; border: 1px solid #ddd;">Tipo</th><th style="padding: 8px; border: 1px solid #ddd;">Quantidade</th><th style="padding: 8px; border: 1px solid #ddd;">Preço Entrada</th><th style="padding: 8px; border: 1px solid #ddd;">Preço Saída</th><th style="padding: 8px; border: 1px solid #ddd;">Resultado</th></tr>';

        lancamentosOperacao.forEach(lanc => {
            detalhes += `<tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${lanc.ativo}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${lanc.tipo}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${lanc.quantidade}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">R$ ${lanc.precoEntrada.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">R$ ${lanc.precoSaida.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid #ddd; color: ${lanc.resultado >= 0 ? 'green' : 'red'}; font-weight: bold;">R$ ${lanc.resultado.toFixed(2)}</td>
            </tr>`;
        });
        detalhes += '</table>';
    }

    document.getElementById('modalTitulo').textContent = 'Detalhes da Operação';
    document.getElementById('modalBody').innerHTML = detalhes;
    document.getElementById('modalResumo').style.display = 'block';
}

function atualizarEstatisticas() {
    const totalOperacoes = operacoes.length;
    const resultadoTotal = operacoes.reduce((total, op) => {
        return total + calcularResultadoOperacao(op.id);
    }, 0);
    const operacoesAbertas = operacoes.filter(op => !op.dataSaida).length;

    document.getElementById('totalOperacoes').textContent = totalOperacoes;
    document.getElementById('resultadoTotal').textContent = `R$ ${resultadoTotal.toFixed(2)}`;
    document.getElementById('operacoesAbertas').textContent = operacoesAbertas;

    const resultadoCard = document.getElementById('resultadoCard');
    if (resultadoTotal > 0) {
        resultadoCard.className = 'stat-card positive';
    } else if (resultadoTotal < 0) {
        resultadoCard.className = 'stat-card negative';
    } else {
        resultadoCard.className = 'stat-card';
    }
}

function atualizarDashboard() {
    const totalOperacoes = operacoes.length;
    const resultadoTotal = operacoes.reduce((total, op) => {
        return total + calcularResultadoOperacao(op.id);
    }, 0);
    const operacoesAbertas = operacoes.filter(op => !op.dataSaida).length;

    const resultados = operacoes.map(op => calcularResultadoOperacao(op.id));
    const operacoesPositivas = resultados.filter(r => r > 0).length;
    const taxaAcerto = totalOperacoes > 0 ? (operacoesPositivas / totalOperacoes * 100) : 0;
    const melhorOperacao = Math.max(...resultados, 0);
    const piorOperacao = Math.min(...resultados, 0);

    document.getElementById('dashTotalOps').innerHTML = `
        <h4>Total de Operações</h4>
        <div class="value" id="totalOperacoes">${totalOperacoes}</div>
        `;

    const dashResultado = document.getElementById('dashResultado');
    dashResultado.querySelector('.value').textContent = `R$ ${resultadoTotal.toFixed(2)}`;

    if (resultadoTotal > 0) {
        dashResultado.className = 'stat-card positive';
    } else if (resultadoTotal < 0) {
        dashResultado.className = 'stat-card negative';
    } else {
        dashResultado.className = 'stat-card';
    }

    document.getElementById('dashAbertas').textContent = operacoesAbertas;
    document.getElementById('dashTaxaAcerto').textContent = `${taxaAcerto.toFixed(1)}%`;
    document.getElementById('dashMelhor').textContent = `R$ ${melhorOperacao.toFixed(2)}`;
    document.getElementById('dashPior').textContent = `R$ ${piorOperacao.toFixed(2)}`;

    const operacoesRecentes = operacoes
        .sort((a, b) => new Date(b.dataEntrada) - new Date(a.dataEntrada))
        .slice(0, 5);

    let htmlRecentes = '';
    if (operacoesRecentes.length === 0) {
        htmlRecentes = '<p>Nenhuma operação cadastrada ainda.</p>';
    } else {
        operacoesRecentes.forEach(op => {
            const resultado = calcularResultadoOperacao(op.id);
            const status = op.dataSaida ? 'Fechada' : 'Aberta';
            const cor = resultado > 0 ? 'green' : resultado < 0 ? 'red' : 'orange';

            htmlRecentes += `
                <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 4px solid ${cor};">
                    <strong>${op.ativo}</strong> (${op.estrategia}) - ${status}<br>
                    <small>${formatarData(op.dataEntrada)} | Resultado: <span style="color: ${cor}; font-weight: bold;">R$ ${resultado.toFixed(2)}</span></small>
                </div>
            `;
        });
    }
    document.getElementById('operacoesRecentes').innerHTML = htmlRecentes;
}

function atualizarSelectEstruturas() {
    const select = document.getElementById('estruturaId');
    select.innerHTML = '<option value="">Selecione uma operação...</option>';

    operacoes.forEach(op => {
        const option = document.createElement('option');
        option.value = op.id;
        const status = op.dataSaida ? '(Fechada)' : '(Aberta)';
        option.textContent = `${op.id} - ${op.ativo} ${op.estrategia} ${status}`;
        select.appendChild(option);
    });
}

function limparFormOperacao() {
    document.getElementById('formOperacao').reset();
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('dataEntrada').value = hoje;
}

function limparFormLancamento() {
    document.getElementById('formLancamento').reset();
    document.getElementById('editandoIndex').value = '';
}

function excluirOperacao(id) {
    if (
        confirm('⚠️ Tem certeza que deseja excluir esta operação?\n\nIsto também excluirá todos os lançamentos relacionados.')) {
        operacoes = operacoes.filter(op => op.id !== id);
        lancamentos = lancamentos.filter(lanc => lanc.estruturaId !== id);
        salvarDados();
        atualizarTabelas();
        atualizarEstatisticas();
        atualizarDashboard();
        atualizarSelectEstruturas();
    }
}

function excluirLancamento(index) {
    if (confirm('⚠️ Tem certeza que deseja excluir este lançamento?')) {
        lancamentos.splice(index, 1);
        salvarDados();
        atualizarTabelas();
        atualizarEstatisticas();
        atualizarDashboard();
    }
}

function formatarData(data) {
    if (!data) return '';
    return new Date(data).toLocaleDateString('pt-BR');
}

function gerarRelatorioMensal() {
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();

    const operacoesMes = operacoes.filter(op => {
        const dataOp = new Date(op.dataEntrada);
        return dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual;
    });

    let resultadoMes = 0;
    let htmlRelatorio = `<h4>Relatório de ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h4>`;

    if (operacoesMes.length === 0) {
        htmlRelatorio += '<p>Nenhuma operação realizada este mês.</p>';
    } else {
        operacoesMes.forEach(op => {
            const resultado = calcularResultadoOperacao(op.id);
            resultadoMes += resultado;
        });

        htmlRelatorio += `
            <p><strong>Total de operações:</strong> ${operacoesMes.length}</p>
            <p><strong>Resultado do mês:</strong> <span style="color: ${resultadoMes >= 0 ? 'green' : 'red'}; font-weight: bold;">R$ ${resultadoMes.toFixed(2)}</span></p>
            <hr>
            <h5>Operações do mês:</h5>
        `;

        operacoesMes.forEach(op => {
            const resultado = calcularResultadoOperacao(op.id);
            htmlRelatorio += `
                <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 4px solid ${cor};">
                    <strong>${op.ativo}</strong> (${op.estrategia}) - ${status}<br>
                    <small>${formatarData(op.dataEntrada)} | Resultado: <span style="color: ${cor}; font-weight: bold;">R$ ${resultado.toFixed(2)}</span></small>
                </div>
            `;
        });
    }

    document.getElementById('relatorioTitulo').textContent = 'Relatório Mensal';
    document.getElementById('relatorioBody').innerHTML = htmlRelatorio;
    document.getElementById('relatorioContent').style.display = 'block';
}

function gerarRelatorioPorAtivo() {
    const ativosPorResultado = {};

    operacoes.forEach(op => {
        const resultado = calcularResultadoOperacao(op.id);
        if (!ativosPorResultado[op.ativo]) {
            ativosPorResultado[op.ativo] = {
                total: 0,
                operacoes: 0,
                lucro: 0,
                prejuizo: 0
            };
        }

        ativosPorResultado[op.ativo].total += resultado;
        ativosPorResultado[op.ativo].operacoes++;

        if (resultado > 0) {
            ativosPorResultado[op.ativo].lucro += resultado;
        } else {
            ativosPorResultado[op.ativo].prejuizo += resultado;
        }
    });

    let htmlRelatorio = '<h4>Relatório por Ativo</h4>';

    if (Object.keys(ativosPorResultado).length === 0) {
        htmlRelatorio += '<p>Nenhuma operação cadastrada.</p>';
    } else {
        Object.entries(ativosPorResultado)
            .sort(([, a], [, b]) => b.total - a.total)
            .forEach(([ativo, dados]) => {
                htmlRelatorio += `
                    <div style="background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #ddd;">
                        <h5 style="color: #2c3e50;">${ativo}</h5>
                        <p><strong>Operações:</strong> ${dados.operacoes}</p>
                        <p><strong>Resultado Total:</strong> <span style="color: ${dados.total >= 0 ? 'green' : 'red'}; font-weight: bold;">R$ ${dados.total.toFixed(2)}</span></p>
                        <p><strong>Lucros:</strong> <span style="color: green;">R$ ${dados.lucro.toFixed(2)}</span></p>
                        <p><strong>Prejuízos:</strong> <span style="color: red;">R$ ${dados.prejuizo.toFixed(2)}</span></p>
                    </div>
                `;
            });
    }

    document.getElementById('relatorioTitulo').textContent = 'Relatório por Ativo';
    document.getElementById('relatorioBody').innerHTML = htmlRelatorio;
    document.getElementById('relatorioContent').style.display = 'block';
}

function gerarRelatorioPorEstrategia() {
    const estrategiasPorResultado = {};

    operacoes.forEach(op => {
        const resultado = calcularResultadoOperacao(op.id);
        if (!estrategiasPorResultado[op.estrategia]) {
            estrategiasPorResultado[op.estrategia] = {
                total: 0,
                operacoes: 0,
                acertos: 0
            };
        }

        estrategiasPorResultado[op.estrategia].total += resultado;
        estrategiasPorResultado[op.estrategia].operacoes++;

        if (resultado > 0) {
            estrategiasPorResultado[op.estrategia].acertos++;
        }
    });

    let htmlRelatorio = '<h4>Relatório por Estratégia</h4>';

    if (Object.keys(estrategiasPorResultado).length === 0) {
        htmlRelatorio += '<p>Nenhuma operação cadastrada.</p>';
    } else {
        Object.entries(estrategiasPorResultado)
            .sort(([, a], [, b]) => b.total - a.total)
            .forEach(([estrategia, dados]) => {
                const taxaAcerto = dados.operacoes > 0 ? (dados.acertos / dados.operacoes * 100) : 0;

                htmlRelatorio += `
                    <div style="background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #ddd;">
                        <h5 style="color: #2c3e50;">${estrategia}</h5>
                        <p><strong>Operações:</strong> ${dados.operacoes}</p>
                        <p><strong>Taxa de Acerto:</strong> ${taxaAcerto.toFixed(1)}%</p>
                        <p><strong>Resultado Total:</strong> <span style="color: ${dados.total >= 0 ? 'green' : 'red'}; font-weight: bold;">R$ ${dados.total.toFixed(2)}</span></p>
                        <p><strong>Resultado Médio:</strong> R$ ${(dados.total / dados.operacoes).toFixed(2)}</p>
                    </div>
                `;
            });
    }

    document.getElementById('relatorioTitulo').textContent = 'Relatório por Estratégia';
    document.getElementById('relatorioBody').innerHTML = htmlRelatorio;
    document.getElementById('relatorioContent').style.display = 'block';
}

function mostrarResumoMes() {
    gerarRelatorioMensal();
    document.getElementById('modalTitulo').textContent = 'Resumo do Mês';
    document.getElementById('modalBody').innerHTML = document.getElementById('relatorioBody').innerHTML;
    document.getElementById('modalResumo').style.display = 'block';
}

function fecharModal() {
    document.getElementById('modalResumo').style.display = 'none';
}

function exportarDadosAuto() {
    const dados = {
        operacoes: operacoes,
        lancamentos: lancamentos,
        proximoId: proximoId,
        config: config,
        dataExportacao: new Date().toISOString(),
        versao: '2.0'
    };

    const dataStr = JSON.stringify(dados, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_trading_${timestamp}_${operacoes.length}ops.json`;
    link.click();

    URL.revokeObjectURL(url);
    config.ultimoBackup = new Date().toISOString();
    salvarDados();
    alert('✅ Backup exportado com sucesso!');
}

function exportarRelatorioPDF() {
    alert('📄 Funcionalidade de PDF será implementada em breve!\n\nPor enquanto, você pode usar o relatório HTML e imprimir como PDF pelo navegador.');
}

function importarDados(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const dados = JSON.parse(e.target.result);

            if (confirm('⚠️ ATENÇÃO: Isso irá sobrescrever todos os dados existentes.\n\nDeseja continuar?')) {
                operacoes = dados.operacoes || [];
                lancamentos = dados.lancamentos || [];
                proximoId = dados.proximoId || 1;
                config = { ...config, ...(dados.config || {}) };

                salvarDados();
                atualizarTabelas();
                atualizarEstatisticas();
                atualizarDashboard();
                atualizarSelectEstruturas();

                alert(`✅ Dados importados com sucesso!\n\n📊 Operações: ${operacoes.length}\n📈 Lançamentos: ${lancamentos.length}`);
            }
        } catch (error) {
            alert('❌ Erro ao importar dados.\n\nVerifique se o arquivo é um backup válido do sistema.');
            console.error('Erro na importação:', error);
        }
    };

    reader.readAsText(file);
    event.target.value = '';
}

function limparTodosDados() {
    if (confirm('⚠️ ATENÇÃO: Esta ação irá EXCLUIR PERMANENTEMENTE todos os seus dados!\n\n🔄 Recomendamos fazer um backup antes.\n\nTem certeza absoluta que deseja continuar?')) {
        if (confirm('🚨 CONFIRMAÇÃO FINAL: Todos os dados serão perdidos para sempre!\n\nClique OK para confirmar a exclusão completa.')) {
            operacoes = [];
            lancamentos = [];
            proximoId = 1;
            config.ultimoBackup = null;

            salvarDados();
            atualizarTabelas();
            atualizarEstatisticas();
            atualizarDashboard();
            atualizarSelectEstruturas();

            alert('🗑️ Todos os dados foram excluídos.\n\nO sistema está limpo para começar novamente.');
        }
    }
}

function verificarAutoBackup() {
    const totalOps = operacoes.length;
    const intervalo = parseInt(config.autoBackupInterval);

    if (totalOps > 0 && totalOps % intervalo === 0) {
        if (confirm(`🔄 Auto-backup sugerido!\n\nVocê tem ${totalOps} operações cadastradas.\n\nDeseja fazer um backup agora?`)) {
            exportarDadosAuto();
        }
    }
}

function inicializarSistema() {
    carregarDados();

    document.getElementById('autoBackupInterval').value = config.autoBackupInterval;
    document.getElementById('moedaPadrao').value = config.moedaPadrao;
}

document.addEventListener('DOMContentLoaded', function () {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            const tabName = item.getAttribute('data-tab');
            showTab(tabName);
        });
    });


    document.getElementById('btnNovaOperacao').addEventListener('click', () => showTab('operacoes'));
    document.getElementById('btnNovoLancamento').addEventListener('click', () => showTab('lancamentos'));
    document.getElementById('btnBackup').addEventListener('click', exportarDadosAuto);
    document.getElementById('btnResumoMes').addEventListener('click', mostrarResumoMes);

    document.getElementById('filtroEstrategia').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroAtivo').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroStatus').addEventListener('change', aplicarFiltros);

    document.getElementById('btnLimparFormOperacao').addEventListener('click', limparFormOperacao);

    document.getElementById('btnCancelarEdicaoLancamento').addEventListener('click', cancelarEdicaoLancamento);
    document.getElementById('btnLimparFormLancamento').addEventListener('click', limparFormLancamento);

    document.getElementById('btnRelatorioMensal').addEventListener('click', gerarRelatorioMensal);
    document.getElementById('btnRelatorioPorAtivo').addEventListener('click', gerarRelatorioPorAtivo);
    document.getElementById('btnRelatorioPorEstrategia').addEventListener('click', gerarRelatorioPorEstrategia);

    document.getElementById('btnExportarBackup').addEventListener('click', exportarDadosAuto);
    document.getElementById('btnExportarPDF').addEventListener('click', exportarRelatorioPDF);
    document.getElementById('btnLimparDados').addEventListener('click', limparTodosDados);
    document.getElementById('fileInput').addEventListener('change', importarDados);
    document.getElementById('autoBackupInterval').addEventListener('change', function () {
        config.autoBackupInterval = parseInt(this.value);
        salvarDados();
    });
    document.getElementById('moedaPadrao').addEventListener('change', function () {
        config.moedaPadrao = this.value;
        salvarDados();
        alert('💱 Configuração salva!\n\nFuncionalidade de conversão de moeda será implementada em breve.');
    });

    document.getElementById('tabelaOperacoes').addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        const action = target.getAttribute('data-action');
        const id = parseInt(target.getAttribute('data-id'));

        if (action === 'editar-operacao') {
            editarOperacao(id);
        }
        if (action === 'excluir-operacao') {
            excluirOperacao(id);
        }
        if (action === 'ver-detalhes') {
            verDetalhesOperacao(id);
        }
    });

    document.getElementById('tabelaLancamentos').addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        const action = target.getAttribute('data-action');
        const index = parseInt(target.getAttribute('data-index'));

        if (action === 'editar-lancamento') {
            editarLancamento(index);
        }
        if (action === 'excluir-lancamento') {
            excluirLancamento(index);
        }
    });

    inicializarSistema();

    setInterval(() => {
        if (operacoes.length > 0 || lancamentos.length > 0) {
            salvarDados();
        }
    }, 30000);

    console.log('🚀 Sistema de Trading Pro carregado com sucesso!');
    console.log('💡 Atalhos disponíveis: Ctrl+B (Backup), Ctrl+N (Nova Operação), Esc (Fechar Modal)');
});
