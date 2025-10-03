const CONSTANTS = {
    AUTO_SAVE_INTERVAL: 30000,
    DEFAULT_CONFIG: {
        autoBackupInterval: 25,
        moedaPadrao: 'BRL',
        ultimoBackup: null
    },
    OPERATION_TYPES: {
        COMPRA: 'COMPRA',
        VENDA: 'VENDA'
    },
    ASSET_TYPES: {
        CALL: 'CALL',
        PUT: 'PUT',
        ACAO: 'AÇÃO'
    },
    STATUS: {
        ABERTA: 'aberta',
        FECHADA: 'fechada'
    }
};

const State = {
    operacoes: [],
    lancamentos: [],
    proximoId: 1,
    operacoesFiltradas: [],
    config: { ...CONSTANTS.DEFAULT_CONFIG },

    reset() {
        this.operacoes = [];
        this.lancamentos = [];
        this.proximoId = 1;
        this.operacoesFiltradas = [];
        this.config = { ...CONSTANTS.DEFAULT_CONFIG };
    },

    getOperacaoById(id) {
        return this.operacoes.find(op => op.id === id);
    },

    getLancamentosByEstrutura(estruturaId) {
        return this.lancamentos.filter(lanc => lanc.estruturaId === estruturaId);
    }
};

const DOMCache = {
    elements: {},

    get(id) {
        if (!this.elements[id]) {
            this.elements[id] = document.getElementById(id);
        }
        return this.elements[id];
    },

    clear() {
        this.elements = {};
    }
};

const Calculator = {
    calcularResultadoLancamento(lanc) {
        const { precoEntrada, precoSaida, quantidade, operacao } = lanc;

        if (!precoSaida || precoSaida === 0) {
            return operacao === CONSTANTS.OPERATION_TYPES.COMPRA
                ? -(precoEntrada * quantidade)
                : precoEntrada * quantidade;
        }

        if (operacao === CONSTANTS.OPERATION_TYPES.COMPRA) {
            return (precoSaida - precoEntrada) * quantidade;
        }

        console.log('exectou')

        return (precoEntrada - precoSaida) * quantidade;
    },

    calcularResultadoOperacao(operacaoId) {
        return State.getLancamentosByEstrutura(operacaoId)
            .reduce((total, lanc) => total + (lanc.resultado || 0), 0);
    },

    calcularResultadoAberto(lanc, precoAtual) {
        if (lanc.operacao === CONSTANTS.OPERATION_TYPES.COMPRA) {
            return (precoAtual - lanc.precoEntrada) * lanc.quantidade;
        }
        return (lanc.precoEntrada - precoAtual) * lanc.quantidade;
    },

    atualizarTodosResultados() {
        if (!State.lancamentos) return;

        State.lancamentos.forEach(lanc => {
            lanc.resultado = this.calcularResultadoLancamento(lanc);
        });
    }
};

const API = {
    async carregarDados() {
        try {
            const response = await fetch('/api/dados');
            const data = await response.json();

            State.operacoes = data.operacoes || [];
            State.lancamentos = data.lancamentos || [];
            State.proximoId = data.proximoId || 1;

            return data;
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            throw new Error('Não foi possível carregar os dados do servidor.');
        }
    },

    async salvarDados() {
        try {
            const dados = {
                operacoes: State.operacoes,
                lancamentos: State.lancamentos,
                proximoId: State.proximoId
            };

            await fetch('/api/dados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            throw new Error('Não foi possível salvar os dados no servidor.');
        }
    },


    async buscarDetalhesOpcao(ativo) {
        const response = await fetch(`/api/option-details/${ativo}`);
        if (!response.ok) {
            throw new Error(`Não foi possível encontrar os detalhes para a opção ${ativo}. Verifique o código.`);
        }
        return response.json();
    },

    async buscarPrecoAcao(ativo) {
        try {
            const response = await fetch(`/api/preco-ativo/${ativo}`);
            return response.json();
        } catch (error) {
            console.error(`Falha ao buscar preço para ${ativo}:`, error);
            return { error: error.message };
        }
    },

    async buscarPrecoOpcao(ativoBase, opcao) {
        try {
            const response = await fetch(`/api/preco/opcao/${ativoBase}/${opcao}`);
            return response.json();
        } catch (error) {
            console.error(`Falha ao buscar preço para ${opcao}:`, error);
            return { error: error.message };
        }
    }
};

const Utils = {
    formatarData(data) {
        if (!data) return '';
        return new Date(data).toLocaleDateString('pt-BR');
    },

    getDataHoje() {
        return new Date().toISOString().split('T')[0];
    },

    isOpcao(tipo) {
        return tipo === CONSTANTS.ASSET_TYPES.CALL || tipo === CONSTANTS.ASSET_TYPES.PUT;
    },

    isAcao(tipo) {
        return tipo === CONSTANTS.ASSET_TYPES.ACAO;
    },

    getCorResultado(valor) {
        if (valor > 0) return 'green';
        if (valor < 0) return 'red';
        return 'orange';
    },

    getClasseResultado(valor) {
        if (valor > 0) return 'tr-positive';
        if (valor < 0) return 'tr-negative';
        return '';
    },

    getTimestampBackup() {
        return new Date().toISOString().replace(/[:.]/g, '-');
    }
};

const PriceUpdater = {
    async atualizarPrecoAcao(lancamento, index) {
        if (!Utils.isAcao(lancamento.tipo) || lancamento.precoSaida !== 0) {
            return;
        }

        const precoAtualCell = DOMCache.get(`preco-atual-lanc-${index}`);
        const resultadoAbertoCell = DOMCache.get(`resultado-aberto-lanc-${index}`);

        const data = await API.buscarPrecoAcao(lancamento.ativo);

        if (data.preco) {
            const precoAtual = data.preco;
            const resultadoAberto = Calculator.calcularResultadoAberto(lancamento, precoAtual);

            precoAtualCell.textContent = `R$ ${precoAtual.toFixed(2)}`;
            resultadoAbertoCell.innerHTML = `<strong style="color: ${Utils.getCorResultado(resultadoAberto)};">R$ ${resultadoAberto.toFixed(2)}</strong>`;
        } else {
            precoAtualCell.textContent = 'N/A';
            resultadoAbertoCell.textContent = '-';
            console.warn(data.error || `Preço não encontrado para ${lancamento.ativo}.`);
        }
    },

    async atualizarPrecoOpcao(lancamento, operacaoPai, index) {
        if (!Utils.isOpcao(lancamento.tipo) || lancamento.precoSaida !== 0 || !operacaoPai) {
            return;
        }

        const precoAtualCell = DOMCache.get(`preco-atual-lanc-${index}`);
        const resultadoAbertoCell = DOMCache.get(`resultado-aberto-lanc-${index}`);

        const data = await API.buscarPrecoOpcao(operacaoPai.ativo, lancamento.ativo);

        if (data.preco) {
            const precoAtual = data.preco;
            const resultadoAberto = Calculator.calcularResultadoAberto(lancamento, precoAtual);

            precoAtualCell.textContent = `R$ ${precoAtual.toFixed(2)}`;
            resultadoAbertoCell.innerHTML = `<strong style="color: ${Utils.getCorResultado(resultadoAberto)};">R$ ${resultadoAberto.toFixed(2)}</strong>`;
        } else {
            precoAtualCell.textContent = 'N/A';
            resultadoAbertoCell.textContent = '-';
            console.warn(data.error || `Preço não encontrado para ${lancamento.ativo}`);
        }
    }
};

const TableRenderer = {
    renderizarLinhaOperacao(operacao) {
        const resultadoTotal = Calculator.calcularResultadoOperacao(operacao.id);
        const classe = Utils.getClasseResultado(resultadoTotal);

        const performance = resultadoTotal > 0
            ? `<span class="performance-indicator performance-positive">LUCRO</span>`
            : resultadoTotal < 0
                ? `<span class="performance-indicator performance-negative">PREJUÍZO</span>`
                : `<span class="performance-indicator">NEUTRO</span>`;

        return `
            <tr class="${classe}">
                <td>${operacao.id}</td>
                <td>${Utils.formatarData(operacao.dataEntrada)}</td>
                <td>${operacao.estrategia}</td>
                <td>${operacao.ativo}</td>
                <td>${operacao.dataSaida ? Utils.formatarData(operacao.dataSaida) : '<em style="color: orange;">Aberta</em>'}</td>
                <td><strong>R$ ${resultadoTotal.toFixed(2)}</strong></td>
                <td>${performance}</td>
                <td>${operacao.observacoes || '-'}</td>
                <td class="actions">
                    <button class="btn btn-small btn-warning" data-action="editar-operacao" data-id="${operacao.id}" title="Editar">✏️</button>
                    <button class="btn btn-small btn-danger" data-action="excluir-operacao" data-id="${operacao.id}" title="Excluir">🗑️</button>
                    <button class="btn btn-small btn-info" data-action="ver-detalhes" data-id="${operacao.id}" title="Detalhes">👁️</button>
                </td>
            </tr>
        `;
    },

    renderizarLinhaLancamento(lancamento, index) {
        const classe = Utils.getClasseResultado(lancamento.resultado);
        const isOption = Utils.isOpcao(lancamento.tipo);
        const isAcao = Utils.isAcao(lancamento.tipo);
        const isAberto = lancamento.precoSaida === 0;

        return `
            <tr class="${classe}">
                <td>${lancamento.estruturaId}</td>
                <td>${lancamento.ativo}</td>
                <td>${lancamento.tipo}</td>
                <td>${lancamento.operacao}</td>
                <td>${lancamento.strike || '-'}</td>
                <td>${lancamento.vencimento ? Utils.formatarData(lancamento.vencimento) : '-'}</td>
                <td>${lancamento.quantidade}</td>
                <td>R$ ${lancamento.precoEntrada.toFixed(2)}</td>
                <td id="preco-atual-lanc-${index}">${(isAberto && (isOption || isAcao)) ? 'Buscando...' : '-'}</td>
                <td id="resultado-aberto-lanc-${index}">${(isAberto && (isOption || isAcao)) ? 'Calculando...' : '-'}</td>
                <td>R$ ${lancamento.precoSaida.toFixed(2)}</td>
                <td><strong>R$ ${lancamento.resultado.toFixed(2)}</strong></td>
                <td class="actions">
                    <button class="btn btn-small btn-warning" data-action="editar-lancamento" data-index="${index}" title="Editar">✏️</button>
                    <button class="btn btn-small btn-danger" data-action="excluir-lancamento" data-index="${index}" title="Excluir">🗑️</button>
                </td>
            </tr>
        `;
    },

    atualizarTabelaOperacoes() {
        const tabela = DOMCache.get('tabelaOperacoes');
        tabela.innerHTML = State.operacoesFiltradas
            .map(op => this.renderizarLinhaOperacao(op))
            .join('');
    },

    atualizarTabelaLancamentos() {
        const tabela = DOMCache.get('tabelaLancamentos');
        tabela.innerHTML = State.lancamentos
            .map((lanc, index) => this.renderizarLinhaLancamento(lanc, index))
            .join('');

        State.lancamentos.forEach((lanc, index) => {
            const isAberto = lanc.precoSaida === 0;
            if (!isAberto) return;

            if (Utils.isAcao(lanc.tipo)) {
                PriceUpdater.atualizarPrecoAcao(lanc, index);
            } else if (Utils.isOpcao(lanc.tipo)) {
                const operacaoPai = State.getOperacaoById(lanc.estruturaId);
                PriceUpdater.atualizarPrecoOpcao(lanc, operacaoPai, index);
            }
        });
    }
};

const Filters = {
    aplicar() {
        const filtroEstrategia = DOMCache.get('filtroEstrategia').value;
        const filtroAtivo = DOMCache.get('filtroAtivo').value.toUpperCase();
        const filtroStatus = DOMCache.get('filtroStatus').value;

        State.operacoesFiltradas = State.operacoes.filter(op => {
            if (filtroEstrategia && op.estrategia !== filtroEstrategia) {
                return false;
            }

            if (filtroAtivo && !op.ativo.includes(filtroAtivo)) {
                return false;
            }

            if (filtroStatus === CONSTANTS.STATUS.ABERTA && op.dataSaida) {
                return false;
            }

            if (filtroStatus === CONSTANTS.STATUS.FECHADA && !op.dataSaida) {
                return false;
            }

            return true;
        });

        TableRenderer.atualizarTabelaOperacoes();
    }
};

const Statistics = {
    calcular() {
        const totalOperacoes = State.operacoes.length;
        const resultadoTotal = State.operacoes.reduce((total, op) => {
            return total + Calculator.calcularResultadoOperacao(op.id);
        }, 0);
        const operacoesAbertas = State.operacoes.filter(op => !op.dataSaida).length;

        const resultados = State.operacoes.map(op => Calculator.calcularResultadoOperacao(op.id));
        const operacoesPositivas = resultados.filter(r => r > 0).length;
        const taxaAcerto = totalOperacoes > 0 ? (operacoesPositivas / totalOperacoes * 100) : 0;
        const melhorOperacao = Math.max(...resultados, 0);
        const piorOperacao = Math.min(...resultados, 0);

        return {
            totalOperacoes,
            resultadoTotal,
            operacoesAbertas,
            taxaAcerto,
            melhorOperacao,
            piorOperacao
        };
    },

    atualizar() {
        const stats = this.calcular();

        DOMCache.get('totalOperacoes').textContent = stats.totalOperacoes;
        DOMCache.get('resultadoTotal').textContent = `R$ ${stats.resultadoTotal.toFixed(2)}`;
        DOMCache.get('operacoesAbertas').textContent = stats.operacoesAbertas;

        const resultadoCard = DOMCache.get('resultadoCard');
        resultadoCard.className = `stat-card ${Utils.getClasseResultado(stats.resultadoTotal)}`;
    }
};

const Dashboard = {
    atualizar() {
        const stats = Statistics.calcular();

        DOMCache.get('dashTotalOps').innerHTML = `
            <h4>Total de Operações</h4>
            <div class="value">${stats.totalOperacoes}</div>
        `;

        const dashResultado = DOMCache.get('dashResultado');
        dashResultado.querySelector('.value').textContent = `R$ ${stats.resultadoTotal.toFixed(2)}`;
        dashResultado.className = `stat-card ${Utils.getClasseResultado(stats.resultadoTotal)}`;

        DOMCache.get('dashAbertas').textContent = stats.operacoesAbertas;
        DOMCache.get('dashTaxaAcerto').textContent = `${stats.taxaAcerto.toFixed(1)}%`;
        DOMCache.get('dashMelhor').textContent = `R$ ${stats.melhorOperacao.toFixed(2)}`;
        DOMCache.get('dashPior').textContent = `R$ ${stats.piorOperacao.toFixed(2)}`;

        this.atualizarOperacoesRecentes();
    },

    atualizarOperacoesRecentes() {
        const operacoesRecentes = State.operacoes
            .sort((a, b) => new Date(b.dataEntrada) - new Date(a.dataEntrada))
            .slice(0, 5);

        let html = '';

        if (operacoesRecentes.length === 0) {
            html = '<p>Nenhuma operação cadastrada ainda.</p>';
        } else {
            operacoesRecentes.forEach(op => {
                const resultado = Calculator.calcularResultadoOperacao(op.id);
                const status = op.dataSaida ? 'Fechada' : 'Aberta';
                const cor = Utils.getCorResultado(resultado);

                html += `
                    <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 4px solid ${cor};">
                        <strong>${op.ativo}</strong> (${op.estrategia}) - ${status}<br>
                        <small>${Utils.formatarData(op.dataEntrada)} | Resultado: <span style="color: ${cor}; font-weight: bold;">R$ ${resultado.toFixed(2)}</span></small>
                    </div>
                `;
            });
        }

        DOMCache.get('operacoesRecentes').innerHTML = html;
    }
};

const Forms = {
    limparOperacao() {
        DOMCache.get('formOperacao').reset();
        DOMCache.get('dataEntrada').value = Utils.getDataHoje();
    },

    limparLancamento() {
        DOMCache.get('formLancamento').reset();
        DOMCache.get('editandoIndex').value = '';
    },

    async salvarOperacao(event) {
        event.preventDefault();

        const operacao = {
            id: State.proximoId++,
            estrutura: State.proximoId - 1,
            dataEntrada: DOMCache.get('dataEntrada').value,
            estrategia: DOMCache.get('estrategia').value,
            ativo: DOMCache.get('ativo').value.toUpperCase(),
            dataSaida: DOMCache.get('dataSaida').value,
            observacoes: DOMCache.get('observacoes').value
        };

        State.operacoes.push(operacao);

        await API.salvarDados();
        App.atualizarTodasViews();
        this.limparOperacao();

        alert('✅ Operação salva com sucesso!');
        Backup.verificarAutoBackup();
    },

    async salvarLancamento(event) {
        event.preventDefault();

        const ativo = DOMCache.get('ativoLancamento').value.toUpperCase();
        if (!ativo) {
            alert('Por favor, insira o código do ativo.');
            return;
        }

        try {
            const optionData = await API.buscarDetalhesOpcao(ativo);
            const precoEntrada = parseFloat(DOMCache.get('precoEntrada').value);
            const quantidade = parseInt(DOMCache.get('quantidade').value);
            const editandoIndex = DOMCache.get('editandoIndex').value;

            const lancamento = {
                estruturaId: parseInt(DOMCache.get('estruturaId').value),
                ativo: ativo,
                tipo: optionData.category,
                operacao: DOMCache.get('operacao').value,
                strike: parseFloat(optionData.strike) || 0,
                vencimento: optionData.due_date.split('T')[0],
                quantidade: quantidade,
                precoEntrada: precoEntrada,
                precoSaida: 0,
                resultado: 0
            };

            lancamento.resultado = Calculator.calcularResultadoLancamento(lancamento);

            if (editandoIndex !== '') {
                State.lancamentos[parseInt(editandoIndex)] = lancamento;
                this.cancelarEdicaoLancamento();
                alert('✅ Lançamento atualizado com sucesso!');
            } else {
                State.lancamentos.push(lancamento);
                this.limparLancamento();
                alert('✅ Lançamento salvo com sucesso!');
            }

            await API.salvarDados();
            App.atualizarTodasViews();

        } catch (error) {
            console.error('Erro ao salvar lançamento:', error);
            alert(error.message);
        }
    },

    editarLancamento(index) {
        const lanc = State.lancamentos[index];

        DOMCache.get('editandoIndex').value = index;
        DOMCache.get('estruturaId').value = lanc.estruturaId;
        DOMCache.get('ativoLancamento').value = lanc.ativo;
        DOMCache.get('tipo').value = lanc.tipo;
        DOMCache.get('operacao').value = lanc.operacao;
        DOMCache.get('strike').value = lanc.strike || '';
        DOMCache.get('vencimento').value = lanc.vencimento || '';
        DOMCache.get('quantidade').value = lanc.quantidade;
        DOMCache.get('precoEntrada').value = lanc.precoEntrada;
        DOMCache.get('precoSaida').value = lanc.precoSaida;

        DOMCache.get('tituloFormLancamento').textContent = 'Editar Lançamento';
        DOMCache.get('btnSalvarLancamento').textContent = 'Atualizar Lançamento';
        DOMCache.get('btnSalvarLancamento').className = 'btn btn-warning';

        DOMCache.get('formLancamento').scrollIntoView({ behavior: 'smooth' });
    },

    cancelarEdicaoLancamento() {
        DOMCache.get('editandoIndex').value = '';
        DOMCache.get('tituloFormLancamento').textContent = 'Novo Lançamento';
        DOMCache.get('btnSalvarLancamento').textContent = 'Salvar Lançamento';
        DOMCache.get('btnSalvarLancamento').className = 'btn btn-success';
        this.limparLancamento();
    },

    editarOperacao(id) {
        const operacao = State.getOperacaoById(id);
        if (!operacao) return;

        DOMCache.get('dataEntrada').value = operacao.dataEntrada;
        DOMCache.get('estrategia').value = operacao.estrategia;
        DOMCache.get('ativo').value = operacao.ativo;
        DOMCache.get('dataSaida').value = operacao.dataSaida || '';
        DOMCache.get('observacoes').value = operacao.observacoes || '';

        State.operacoes = State.operacoes.filter(op => op.id !== id);

        Navigation.showTab('operacoes');
        DOMCache.get('formOperacao').scrollIntoView({ behavior: 'smooth' });
    },

    atualizarSelectEstruturas() {
        const select = DOMCache.get('estruturaId');
        select.innerHTML = '<option value="">Selecione uma operação...</option>';

        State.operacoes.forEach(op => {
            const option = document.createElement('option');
            option.value = op.id;
            const status = op.dataSaida ? '(Fechada)' : '(Aberta)';
            option.textContent = `${op.id} - ${op.ativo} ${op.estrategia} ${status}`;
            select.appendChild(option);
        });
    }
};

const DataManager = {
    async excluirOperacao(id) {
        if (confirm('⚠️ Tem certeza que deseja excluir esta operação?\n\nIsto também excluirá todos os lançamentos relacionados.')) {
            State.operacoes = State.operacoes.filter(op => op.id !== id);
            State.lancamentos = State.lancamentos.filter(lanc => lanc.estruturaId !== id);

            await API.salvarDados();
            App.atualizarTodasViews();
        }
    },

    async excluirLancamento(index) {
        if (confirm('⚠️ Tem certeza que deseja excluir este lançamento?')) {
            State.lancamentos.splice(index, 1);

            await API.salvarDados();
            App.atualizarTodasViews();
        }
    },

    async limparTodosDados() {
        if (confirm('⚠️ ATENÇÃO: Esta ação irá EXCLUIR PERMANENTEMENTE todos os seus dados!\n\n🔄 Recomendamos fazer um backup antes.\n\nTem certeza absoluta que deseja continuar?')) {
            if (confirm('🚨 CONFIRMAÇÃO FINAL: Todos os dados serão perdidos para sempre!\n\nClique OK para confirmar a exclusão completa.')) {
                State.reset();

                await API.salvarDados();
                App.atualizarTodasViews();

                alert('🗑️ Todos os dados foram excluídos.\n\nO sistema está limpo para começar novamente.');
            }
        }
    }
};

const Reports = {
    gerarMensal() {
        const mesAtual = new Date().getMonth();
        const anoAtual = new Date().getFullYear();

        const operacoesMes = State.operacoes.filter(op => {
            const dataOp = new Date(op.dataEntrada);
            return dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual;
        });

        let resultadoMes = 0;
        let htmlRelatorio = `<h4>Relatório de ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h4>`;

        if (operacoesMes.length === 0) {
            htmlRelatorio += '<p>Nenhuma operação realizada este mês.</p>';
        } else {
            operacoesMes.forEach(op => {
                resultadoMes += Calculator.calcularResultadoOperacao(op.id);
            });

            htmlRelatorio += `
                <p><strong>Total de operações:</strong> ${operacoesMes.length}</p>
                <p><strong>Resultado do mês:</strong> <span style="color: ${Utils.getCorResultado(resultadoMes)}; font-weight: bold;">R$ ${resultadoMes.toFixed(2)}</span></p>
                <hr>
                <h5>Operações do mês:</h5>
            `;

            operacoesMes.forEach(op => {
                const resultado = Calculator.calcularResultadoOperacao(op.id);
                const status = op.dataSaida ? 'Fechada' : 'Aberta';
                const cor = Utils.getCorResultado(resultado);

                htmlRelatorio += `
                    <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 4px solid ${cor};">
                        <strong>${op.ativo}</strong> (${op.estrategia}) - ${status}<br>
                        <small>${Utils.formatarData(op.dataEntrada)} | Resultado: <span style="color: ${cor}; font-weight: bold;">R$ ${resultado.toFixed(2)}</span></small>
                    </div>
                `;
            });
        }

        return htmlRelatorio;
    },

    gerarPorAtivo() {
        const ativosPorResultado = {};

        State.operacoes.forEach(op => {
            const resultado = Calculator.calcularResultadoOperacao(op.id);

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
                            <p><strong>Resultado Total:</strong> <span style="color: ${Utils.getCorResultado(dados.total)}; font-weight: bold;">R$ ${dados.total.toFixed(2)}</span></p>
                            <p><strong>Lucros:</strong> <span style="color: green;">R$ ${dados.lucro.toFixed(2)}</span></p>
                            <p><strong>Prejuízos:</strong> <span style="color: red;">R$ ${dados.prejuizo.toFixed(2)}</span></p>
                        </div>
                    `;
                });
        }

        return htmlRelatorio;
    },

    gerarPorEstrategia() {
        const estrategiasPorResultado = {};

        State.operacoes.forEach(op => {
            const resultado = Calculator.calcularResultadoOperacao(op.id);

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
                            <p><strong>Resultado Total:</strong> <span style="color: ${Utils.getCorResultado(dados.total)}; font-weight: bold;">R$ ${dados.total.toFixed(2)}</span></p>
                            <p><strong>Resultado Médio:</strong> R$ ${(dados.total / dados.operacoes).toFixed(2)}</p>
                        </div>
                    `;
                });
        }

        return htmlRelatorio;
    },

    exibir(tipo) {
        let conteudo = '';
        let titulo = '';

        switch (tipo) {
            case 'mensal':
                titulo = 'Relatório Mensal';
                conteudo = this.gerarMensal();
                break;
            case 'ativo':
                titulo = 'Relatório por Ativo';
                conteudo = this.gerarPorAtivo();
                break;
            case 'estrategia':
                titulo = 'Relatório por Estratégia';
                conteudo = this.gerarPorEstrategia();
                break;
        }

        DOMCache.get('relatorioTitulo').textContent = titulo;
        DOMCache.get('relatorioBody').innerHTML = conteudo;
        DOMCache.get('relatorioContent').style.display = 'block';
    }
};

const Details = {
    exibirOperacao(id) {
        const operacao = State.getOperacaoById(id);
        const lancamentosOperacao = State.getLancamentosByEstrutura(id);
        const resultado = Calculator.calcularResultadoOperacao(id);

        let detalhes = `
            <h4>Operação #${operacao.id} - ${operacao.ativo}</h4>
            <p><strong>Estratégia:</strong> ${operacao.estrategia}</p>
            <p><strong>Data Entrada:</strong> ${Utils.formatarData(operacao.dataEntrada)}</p>
            <p><strong>Data Saída:</strong> ${operacao.dataSaida ? Utils.formatarData(operacao.dataSaida) : 'Operação ainda aberta'}</p>
            <p><strong>Resultado Total:</strong> <span style="color: ${Utils.getCorResultado(resultado)}; font-weight: bold;">R$ ${resultado.toFixed(2)}</span></p>
            <p><strong>Observações:</strong> ${operacao.observacoes || 'Nenhuma observação'}</p>
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
                    <td style="padding: 8px; border: 1px solid #ddd; color: ${Utils.getCorResultado(lanc.resultado)}; font-weight: bold;">R$ ${lanc.resultado.toFixed(2)}</td>
                </tr>`;
            });
            detalhes += '</table>';
        }

        DOMCache.get('modalTitulo').textContent = 'Detalhes da Operação';
        DOMCache.get('modalBody').innerHTML = detalhes;
        DOMCache.get('modalResumo').style.display = 'block';
    }
};

const Backup = {
    exportar() {
        const dados = {
            operacoes: State.operacoes,
            lancamentos: State.lancamentos,
            proximoId: State.proximoId,
            config: State.config,
            dataExportacao: new Date().toISOString(),
            versao: '2.0'
        };

        const dataStr = JSON.stringify(dados, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const timestamp = Utils.getTimestampBackup();
        const link = document.createElement('a');

        link.href = url;
        link.download = `backup_trading_${timestamp}_${State.operacoes.length}ops.json`;
        link.click();

        URL.revokeObjectURL(url);
        State.config.ultimoBackup = new Date().toISOString();

        API.salvarDados();
        alert('✅ Backup exportado com sucesso!');
    },

    async importar(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const dados = JSON.parse(e.target.result);

                if (confirm('⚠️ ATENÇÃO: Isso irá sobrescrever todos os dados existentes.\n\nDeseja continuar?')) {
                    State.operacoes = dados.operacoes || [];
                    State.lancamentos = dados.lancamentos || [];
                    State.proximoId = dados.proximoId || 1;
                    State.config = { ...State.config, ...(dados.config || {}) };

                    await API.salvarDados();
                    App.atualizarTodasViews();

                    alert(`✅ Dados importados com sucesso!\n\n📊 Operações: ${State.operacoes.length}\n📈 Lançamentos: ${State.lancamentos.length}`);
                }
            } catch (error) {
                alert('❌ Erro ao importar dados.\n\nVerifique se o arquivo é um backup válido do sistema.');
                console.error('Erro na importação:', error);
            }
        };

        reader.readAsText(file);
        event.target.value = '';
    },

    verificarAutoBackup() {
        const totalOps = State.operacoes.length;
        const intervalo = parseInt(State.config.autoBackupInterval);

        if (totalOps > 0 && totalOps % intervalo === 0) {
            if (confirm(`🔄 Auto-backup sugerido!\n\nVocê tem ${totalOps} operações cadastradas.\n\nDeseja fazer um backup agora?`)) {
                this.exportar();
            }
        }
    },

    exportarPDF() {
        alert('📄 Funcionalidade de PDF será implementada em breve!\n\nPor enquanto, você pode usar o relatório HTML e imprimir como PDF pelo navegador.');
    }
};

const Navigation = {
    showTab(tabName) {
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(tab => tab.classList.remove('active'));

        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => item.classList.remove('active'));

        DOMCache.get(tabName).classList.add('active');
        document.querySelector(`.nav-item[data-tab=${tabName}]`).classList.add('active');

        if (tabName === 'dashboard') {
            Dashboard.atualizar();
        }
    }
};

const Modal = {
    fechar() {
        DOMCache.get('modalResumo').style.display = 'none';
    },

    mostrarResumoMes() {
        const conteudo = Reports.gerarMensal();
        DOMCache.get('modalTitulo').textContent = 'Resumo do Mês';
        DOMCache.get('modalBody').innerHTML = conteudo;
        DOMCache.get('modalResumo').style.display = 'block';
    }
};

const Config = {
    atualizarAutoBackup(valor) {
        State.config.autoBackupInterval = parseInt(valor);
        API.salvarDados();
    },

    atualizarMoeda(moeda) {
        State.config.moedaPadrao = moeda;
        API.salvarDados();
        alert('💱 Configuração salva!\n\nFuncionalidade de conversão de moeda será implementada em breve.');
    }
};

const App = {
    async inicializar() {
        try {
            await API.carregarDados();

            DOMCache.get('dataEntrada').value = Utils.getDataHoje();
            DOMCache.get('autoBackupInterval').value = State.config.autoBackupInterval;
            DOMCache.get('moedaPadrao').value = State.config.moedaPadrao;

            this.atualizarTodasViews();
            Backup.verificarAutoBackup();

            console.log('🚀 Sistema de Trading Pro carregado com sucesso!');
            console.log('💡 Atalhos disponíveis: Ctrl+B (Backup), Ctrl+N (Nova Operação), Esc (Fechar Modal)');
        } catch (error) {
            alert(error.message);
        }
    },

    atualizarTodasViews() {
        State.operacoesFiltradas = State.operacoes;
        TableRenderer.atualizarTabelaOperacoes();
        TableRenderer.atualizarTabelaLancamentos();
        Statistics.atualizar();
        Dashboard.atualizar();
        Forms.atualizarSelectEstruturas();
    },

    configurarEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (event) => {
                event.preventDefault();
                const tabName = item.getAttribute('data-tab');
                Navigation.showTab(tabName);
            });
        });

        DOMCache.get('formOperacao').addEventListener('submit', (e) => Forms.salvarOperacao(e));
        DOMCache.get('formLancamento').addEventListener('submit', (e) => Forms.salvarLancamento(e));

        DOMCache.get('btnNovaOperacao').addEventListener('click', () => Navigation.showTab('operacoes'));
        DOMCache.get('btnNovoLancamento').addEventListener('click', () => Navigation.showTab('lancamentos'));
        DOMCache.get('btnBackup').addEventListener('click', () => Backup.exportar());
        DOMCache.get('btnResumoMes').addEventListener('click', () => Modal.mostrarResumoMes());

        DOMCache.get('filtroEstrategia').addEventListener('change', () => Filters.aplicar());
        DOMCache.get('filtroAtivo').addEventListener('change', () => Filters.aplicar());
        DOMCache.get('filtroStatus').addEventListener('change', () => Filters.aplicar());

        DOMCache.get('btnLimparFormOperacao').addEventListener('click', () => Forms.limparOperacao());
        DOMCache.get('btnCancelarEdicaoLancamento').addEventListener('click', () => Forms.cancelarEdicaoLancamento());
        DOMCache.get('btnLimparFormLancamento').addEventListener('click', () => Forms.limparLancamento());

        DOMCache.get('btnRelatorioMensal').addEventListener('click', () => Reports.exibir('mensal'));
        DOMCache.get('btnRelatorioPorAtivo').addEventListener('click', () => Reports.exibir('ativo'));
        DOMCache.get('btnRelatorioPorEstrategia').addEventListener('click', () => Reports.exibir('estrategia'));

        DOMCache.get('btnExportarBackup').addEventListener('click', () => Backup.exportar());
        DOMCache.get('btnExportarPDF').addEventListener('click', () => Backup.exportarPDF());
        DOMCache.get('btnLimparDados').addEventListener('click', () => DataManager.limparTodosDados());
        DOMCache.get('fileInput').addEventListener('change', (e) => Backup.importar(e));

        DOMCache.get('autoBackupInterval').addEventListener('change', function () {
            Config.atualizarAutoBackup(this.value);
        });

        DOMCache.get('moedaPadrao').addEventListener('change', function () {
            Config.atualizarMoeda(this.value);
        });

        DOMCache.get('tabelaOperacoes').addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            const action = target.getAttribute('data-action');
            const id = parseInt(target.getAttribute('data-id'));

            switch (action) {
                case 'editar-operacao':
                    Forms.editarOperacao(id);
                    break;
                case 'excluir-operacao':
                    DataManager.excluirOperacao(id);
                    break;
                case 'ver-detalhes':
                    Details.exibirOperacao(id);
                    break;
            }
        });

        DOMCache.get('tabelaLancamentos').addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            const action = target.getAttribute('data-action');
            const index = parseInt(target.getAttribute('data-index'));

            switch (action) {
                case 'editar-lancamento':
                    Forms.editarLancamento(index);
                    break;
                case 'excluir-lancamento':
                    DataManager.excluirLancamento(index);
                    break;
            }
        });

        setInterval(() => {
            if (State.operacoes.length > 0 || State.lancamentos.length > 0) {
                API.salvarDados();
            }
        }, CONSTANTS.AUTO_SAVE_INTERVAL);
    }
};

document.addEventListener('DOMContentLoaded', function () {
    App.configurarEventListeners();
    App.inicializar();
});