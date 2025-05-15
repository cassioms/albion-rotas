// Importa a lista de mapas
import { albionMaps } from './maps.js';

// Inicialização da rede de visualização
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);

// Gerenciamento de conexões ativas
let activeConnections = new Map();

// Preenche as datalists com os mapas disponíveis
const mapList1 = document.getElementById('mapList1');
const mapList2 = document.getElementById('mapList2');
const node1Input = document.getElementById('node1');
const node2Input = document.getElementById('node2');

albionMaps.forEach(map => {
    const option1 = document.createElement('option');
    const option2 = document.createElement('option');
    option1.value = map;
    option2.value = map;
    mapList1.appendChild(option1);
    mapList2.appendChild(option2);
});

// Validação para garantir que apenas mapas válidos sejam selecionados
function validateMapInput(input) {
    const value = input.value;
    if (!albionMaps.includes(value)) {
        input.setCustomValidity('Por favor, selecione um mapa válido da lista');
    } else {
        input.setCustomValidity('');
    }
}

node1Input.addEventListener('input', () => validateMapInput(node1Input));
node2Input.addEventListener('input', () => validateMapInput(node2Input));

// Funções de persistência de dados
function saveToLocalStorage() {
    // Formato otimizado: [n:[{id,l}], e:[{i,f,t,l}], c:[{i,t}]]
    const graphData = {
        n: nodes.get().map(node => ({ i: node.id, l: node.label })),
        e: edges.get().map(edge => ({ i: edge.id, f: edge.from, t: edge.to, l: edge.label })),
        c: Array.from(activeConnections.entries()).map(([edgeId, connection]) => ({
            i: edgeId,
            t: connection.endTime
        }))
    };
    localStorage.setItem('gd', JSON.stringify(graphData));
}

function loadFromLocalStorage() {
    const savedData = localStorage.getItem('gd');
    if (savedData) {
        const graphData = JSON.parse(savedData);
        nodes.clear();
        edges.clear();
        activeConnections.clear();

        // Primeiro, adiciona todos os nós
        nodes.add(graphData.n.map(n => ({ id: n.i, label: n.l })));

        // Em seguida, processa as conexões ativas
        const connections = graphData.c;
        connections.forEach(conn => {
            const edgeId = conn.i;
            const endTime = conn.t;
            const [node1, node2] = edgeId.split('|');
            
            if (endTime === -1) {
                // Conexão permanente
                edges.add({
                    id: edgeId,
                    from: node1,
                    to: node2,
                    label: formatTime(-1)
                });

                activeConnections.set(edgeId, {
                    endTime: -1,
                    timeoutId: null
                });
            } else {
                const timeLeft = Math.floor((endTime - Date.now()) / 1000);
                if (timeLeft > 0) {
                    // Adiciona a aresta com o tempo formatado
                    edges.add({
                        id: edgeId,
                        from: node1,
                        to: node2,
                        label: formatTime(timeLeft)
                    });

                    // Configura o timeout para a conexão
                    const connection = {
                        endTime: endTime,
                        timeoutId: setTimeout(() => removeConnection(edgeId), timeLeft * 1000)
                    };
                    activeConnections.set(edgeId, connection);
                }
            }
        });

        // Por fim, remove quaisquer nós que não tenham conexões
        cleanupUnusedNodes();
    }
}

// Configurações da visualização do grafo
const options = {
    nodes: {
        shape: 'dot',
        size: 10,
        font: {
            size: 16,
            face: 'arial',
            vadjust: -3
        },
        margin: 20,
        color: {
            background: '#4CAF50',
            border: '#2E7D32',
            highlight: {
                background: '#81C784',
                border: '#2E7D32'
            }
        }
    },
    edges: {
        font: {
            size: 14,
            align: 'middle',
            background: 'white'
        },
        arrows: {
            to: false
        },
        color: {
            color: '#2E7D32',
            highlight: '#81C784'
        },
        length: 140,
        selectionWidth: 2,
        endPointOffset: 0,
        smooth: {
            enabled: true,
            type: 'continuous'
        }
    },
    physics: {
        enabled: true,
        solver: 'hierarchicalRepulsion',
    },
    layout: {
        hierarchical: {
            enabled: true,
            direction: 'LR',
            sortMethod: 'hubsize',
            shakeTowards: 'leaves'
        }
    }
};

// Criação do container de rede
const container = document.getElementById('graph-container');
const data = {
    nodes: nodes,
    edges: edges
};
const network = new vis.Network(container, data, options);

// Gerenciamento do botão de remoção
const removeButton = document.getElementById('remove-connection');
let selectedEdgeId = null;

// Adiciona evento de clique na aresta
network.on('selectEdge', function(params) {
    if (params.edges.length === 1) {
        selectedEdgeId = params.edges[0];
        removeButton.style.display = 'block';
    }
});

// Esconde o botão quando nenhuma aresta estiver selecionada
network.on('deselectEdge', function() {
    selectedEdgeId = null;
    removeButton.style.display = 'none';
});

// Adiciona evento de clique no botão de remoção
removeButton.addEventListener('click', function() {
    if (selectedEdgeId) {
        removeConnection(selectedEdgeId);
        selectedEdgeId = null;
        removeButton.style.display = 'none';
        network.unselectAll();
    }
});

// Função para atualizar o cabeçalho com data e hora
function updateHeader() {
    const now = new Date();
    const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    
    const formatDate = (date) => {
        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    
    const localTime = formatDate(now);
    const utcTime = formatDate(utc);
    
    const header = document.getElementById('header');
    header.textContent = `Rotas - ${localTime} - ${utcTime} UTC`;
}

// Atualiza o cabeçalho a cada segundo
setInterval(updateHeader, 1000);

// Carrega os dados salvos ao iniciar a página e atualiza o cabeçalho
loadFromLocalStorage();
updateHeader();

// Função para atualizar os labels das conexões
function updateConnectionLabels() {
    activeConnections.forEach((connection, edgeId) => {
        if (connection.endTime === -1) return; // Ignora conexões permanentes
        
        const currentTime = Math.floor((connection.endTime - Date.now()) / 1000);
        if (currentTime <= 0) {
            removeConnection(edgeId);
        } else {
            edges.update({
                id: edgeId,
                label: formatTime(currentTime)
            });
        }
    });
}

// Inicia o intervalo de atualização dos labels
setInterval(updateConnectionLabels, 1000);

// Função para adicionar uma nova conexão
function addConnection(node1, node2, duration) {
    // Adiciona os nós se não existirem
    if (!nodes.get(node1)) {
        nodes.add({ id: node1, label: node1 });
    }
    if (!nodes.get(node2)) {
        nodes.add({ id: node2, label: node2 });
    }

    // Cria um ID único para a conexão
    const edgeId = `${node1}|${node2}`;

    // Adiciona a aresta com o tempo formatado
    edges.add({
        id: edgeId,
        from: node1,
        to: node2,
        label: formatTime(duration)
    });

    // Armazena a informação da conexão
    if (duration === -1) {
        // Conexão permanente
        activeConnections.set(edgeId, {
            endTime: -1,
            timeoutId: null
        });
    } else {
        // Conexão temporária
        activeConnections.set(edgeId, {
            endTime: Date.now() + (duration * 1000),
            timeoutId: setTimeout(() => removeConnection(edgeId), duration * 1000)
        });
    }

    // Salva o estado atual no localStorage
    saveToLocalStorage();
}

// Função para remover uma conexão
function removeConnection(edgeId) {
    // Remove a aresta
    edges.remove(edgeId);

    // Limpa o timeout e remove da lista de conexões ativas
    const connection = activeConnections.get(edgeId);
    if (connection) {
        clearTimeout(connection.timeoutId);
        activeConnections.delete(edgeId);
    }

    // Remove nós que não têm mais conexões
    cleanupUnusedNodes();

    // Salva o estado atual no localStorage
    saveToLocalStorage();
}

// Função para limpar nós sem conexões
function cleanupUnusedNodes() {
    const connectedNodes = new Set();
    edges.forEach(edge => {
        connectedNodes.add(edge.from);
        connectedNodes.add(edge.to);
    });

    nodes.forEach(node => {
        if (!connectedNodes.has(node.id)) {
            nodes.remove(node.id);
        }
    });
}

// Manipulador do formulário
// Função para formatar o tempo em horas, minutos e segundos
function formatTime(totalSeconds) {
    if (totalSeconds === -1) {
        return '';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    let timeString = '';
    if (hours > 0) timeString += `${hours}h `;
    if (minutes > 0 || (hours === 0 && minutes === 0 && seconds === 0)) timeString += `${minutes}m `;
    if (minutes === 0 && seconds > 0) timeString += `${seconds}s`;
    
    return timeString.trim();
}

// Adiciona evento para mostrar/esconder campos de tempo
document.getElementById('isPermanent').addEventListener('change', function(e) {
    const timeGroup = document.getElementById('time-group');
    timeGroup.style.display = this.checked ? 'none' : 'block';
    
    // Remove o required dos campos de tempo quando for permanente
    const hoursInput = document.getElementById('hours');
    const minutesInput = document.getElementById('minutes');
    hoursInput.required = !this.checked;
    minutesInput.required = !this.checked;
});

document.getElementById('connection-form').addEventListener('submit', function(e) {
    e.preventDefault();

    const node1 = document.getElementById('node1').value.trim();
    const node2 = document.getElementById('node2').value.trim();
    const isPermanent = document.getElementById('isPermanent').checked;
    
    let totalSeconds = -1; // Valor padrão para conexões permanentes
    
    if (!isPermanent) {
        const hours = parseInt(document.getElementById('hours').value) || 0;
        const minutes = parseInt(document.getElementById('minutes').value) || 0;
        totalSeconds = hours * 3600 + minutes * 60;
        
        if (totalSeconds <= 0) {
            return; // Não permite conexões temporárias com tempo zero
        }
    }

    if (node1 && node2) {
        addConnection(node1, node2, totalSeconds);
        
        // Limpa o formulário
        this.reset();
        // Reseta os valores dos campos de tempo para 0
        document.getElementById('hours').value = '0';
        document.getElementById('minutes').value = '0';
        // Reseta o checkbox
        document.getElementById('isPermanent').checked = false;
        // Mostra os campos de tempo
        document.getElementById('time-group').style.display = 'block';
    }
});

// Adiciona funcionalidade de rolagem do mouse para os campos de tempo
const hoursInput = document.getElementById('hours');
const minutesInput = document.getElementById('minutes');

function handleWheel(event, input, max) {
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * -1; // -1 para baixo, 1 para cima
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(0, Math.min(max, currentValue + delta));
    input.value = newValue;
}

hoursInput.addEventListener('wheel', function(e) {
    handleWheel(e, this, 23); // Máximo de 23 horas
});

minutesInput.addEventListener('wheel', function(e) {
    handleWheel(e, this, 59); // Máximo de 59 minutos
});