// ------------

space = localStorage.getItem("space")
  ? JSON.parse(localStorage.getItem("space"))
  : space;

// Globals
const pathMemberHighlightId = 'path-member';
const pathMemberClassName = 'path-member';
const invalidPathClassName = 'invalid-path';
const highlightId = 'start-highlight';
const blueColor = '#4666E5';
const blackColor = '#222222';
const invalidColor = '#FF4365';
const outlineColor = '#a1a1a1';
const backgroundColor = '#201e29';
const startAttrs = {
    padding: 2,
    attrs: {
        stroke: blueColor,
        'stroke-width': 2
    }
};
let nextId = 1;
const size = 40;
const getTargetMarkerStyle = (Color=outlineColor) => ({ type: 'path', d: 'M 6 -3 0 0 6 3 z', fill: Color, stroke: Color });
const getLinkStyle = () => {
    return V.createSVGStyle(`
            .joint-link .${pathMemberClassName} {
                stroke: ${blueColor};
                stroke-dasharray: 5;
                stroke-dashoffset: 100;
                animation: dash 1.25s infinite linear;
            }
        `) 
}

const graph = new joint.dia.Graph;
const paperElement = document.getElementById('paper');
const paper = new joint.dia.Paper({
    el: paperElement,
    background: { color: backgroundColor},
    width: "100%",
    height: "100%",
    gridSize: 1,
    model: graph,
    sorting: joint.dia.Paper.sorting.APPROX,
    defaultLink: () => new joint.shapes.standard.Link({ attrs: { line: { targetMarker: getTargetMarkerStyle(), stroke: outlineColor}}}),
    defaultConnectionPoint: { name: 'boundary', args: { offset: 4 }},
    linkPinning: false,
    async: true,
    frozen: true,
    interactive: () => true, 
    validateConnection: (cellViewS, _magnetS, cellViewT) => {
        const id = [cellViewS.model.id, cellViewT.model.id].join(); //sort().join()
        const existingLink = graph.getCell(id);
        const isSameCell = cellViewS.model.id === cellViewT.model.id;

        return !isSameCell && !existingLink && !cellViewT.model.isLink();
    },
    highlighting: {
        connecting: {
            name: 'mask',
            options: {
                padding: 2,
                attrs: {
                    stroke: blueColor,
                    'stroke-width': 2
                }
            }
        }
    }
});


const editController = new EditController({ graph, paper, createLink, createNode, size, space });
const viewController = new ViewController({ graph, paper, createLink, createNode, size, space });


// Create a node with `id`
function createNode(id) {
    var node;
    if (nodeType === 1) node = createNeuron(id)
    else if (nodeType === 2) node = createActuator(id)
    else if (nodeType === 3) node = createSensor(id)
    else if (nodeType === 4) node = createModule(id);
    return node;
}

function createNeuron (id) {
    const node = (new joint.shapes.standard.Circle({
        id,
        size: { width: size, height: size },
        z: 1,
        attrs: {
            root: {
                highlighterSelector: 'circle'
            },
            body: {
                fill: '#383838',//blackColor,
                stroke: outlineColor
            },
            label: {
                fill: '#fff',
                style: { textTransform: 'capitalize' },
                pointerEvents: 'none',
            }
        }
    })).addTo(graph);

    const view = node.findView(paper);
    view.addTools(new joint.dia.ToolsView({
        tools: [
            new joint.elementTools.HoverConnect({
                useModelGeometry: true,
                trackPath: V.convertCircleToPathData(joint.V(`<circle cx="${size / 2}" cy="${size / 2}"  r="${size / 2}" />`))
            }),
        ]
    }));

    view.hideTools();

    return node;
};

function createActuator (id) {
    const node = (new joint.shapes.standard.Rectangle({
        id,
        size: { width: size, height: size },
        z: 1,
        attrs: {
            body: {
                fill: '#383838',//blackColor,
                stroke: outlineColor
            },
            label: {
                fill: '#fff',
                style: { textTransform: 'capitalize' },
                pointerEvents: 'none',
            }
        }
    })).addTo(graph);

    return node;

};

function createSensor (id) {
    const node = (new joint.shapes.standard.Polygon({
        id,
        size: { width: size, height: size },
        z: 1,
        attrs: {
            body: {
                fill: '#383838',//blackColor,
                stroke: outlineColor,
                refPoints: '0,25 25,8 50,25 40,50 10,50',
            },
            label: {
                fill: '#fff',
                style: { textTransform: 'capitalize' },
                pointerEvents: 'none',
            }
        }
    })).addTo(graph);

    const view = node.findView(paper);
    view.addTools(new joint.dia.ToolsView({
        tools: [
            new joint.elementTools.HoverConnect({
                useModelGeometry: true,
                trackPath: V.convertCircleToPathData(joint.V(`<circle cx="${size / 2}" cy="${size / 2}"  r="${size / 2}" />`))
            }),
        ]
    }));

    view.hideTools();

    const NodeSpace = space.nodes.find(N => N.id === id);
    let sizeFront = 14;
    if (NodeSpace.setting.key.length > 2) sizeFront = 4;
    node.attr('label/font-size', sizeFront);
    node.attr('label/text', NodeSpace.setting.key);

    return node;

};

function createModule (id) {
    const node = (new joint.shapes.standard.BorderedImage({
        id,
        size: { width: 150, height: 150 },
        z: 1,
        attrs: {
            border: {
                rx: 3,
                ry: 3,
                stroke: '#a1a1a1',
                strokeWidth: 3
            },
            background: {
                fill: '#383838'
            }
        }
    })).addTo(graph);

    return node;
};



// Create a link 
function createLink(s, t, color=outlineColor) {
    const link  = new joint.shapes.standard.Link({
        id: [s,t].join('-'),  
        source: { id: s }, 
        target: { id: t },
        z: 1,
        attrs: {
            wrapper: {
                stroke: backgroundColor,
                'stroke-width': 6
            },
            line: { targetMarker: getTargetMarkerStyle(color), stroke: color}
        }
    });

    


    link.addTo(graph);

    const view = link.findView(paper);
    view.addTools(new joint.dia.ToolsView({
        tools: [
            //new joint.linkTools.Vertices(),
            new joint.linkTools.Remove({ distance: '10%', action: function(evt){
                const linkIndex = space.links.findIndex(findlink => findlink.id === link.id);
                if (linkIndex !== -1) {
                    space.links.splice(linkIndex, 1);
                }
                link.remove();
                reFreshInspector();
                unSelect(null, {button : 0});
                localStorage.setItem("space", JSON.stringify(space));

                StopSpace();
                StopRender();
                btnPlay.children[0].src = "img/play.png"; 
            } })
        ]
    }));

    view.hideTools();

    refreshLink();
};



function getNodeId() {
    let result = '';
    if (nodeType === 1) result = 'N';
    if (nodeType === 2) result = 'A';
    if (nodeType === 3) result = 'S';
    if (nodeType === 4) result = 'M';

    let currentId = nextId;

    result = result + String(currentId).padStart(5, '0');

    nextId++;
    return result;
}

function RemoveAll() {
    space = { nodes: [], links: [] };
    localStorage.setItem("space", JSON.stringify(space));
    nextId = 1;
    reFreshInspector();
}

function StartEditor() {
    for(const element of graph.getElements()) {
        element.attr('body/cursor', 'move'); 
    }
    
    showAll();

}

function showAll (){

    paper.scale(1, 1);
    const border = graph.getBBox();
    let area = paper.getArea();

    if (border == null) return;


    const scaleX = area.width / border.width;
    const scaleY = area.height / border.height;
    let scale = Math.min(scaleX, scaleY) * 0.95;
    scale = Math.min(Math.max(scale, 0.1), 3);

    paper.scale(scale, scale);
    area = paper.getArea();


    const offsetX = (area.width - border.width) / 2;
    const offsetY = (area.height - border.height) / 2;


    paper.translate((-border.x + offsetX) * scale, (-border.y + offsetY) * scale);

    editController.startListening();
    viewController.startListening();
};

const styles = V.createSVGStyle(`
    .joint-element .${pathMemberClassName} {
        stroke: ${blueColor};
        fill: ${blueColor};
        fill-opacity: 0.75;
    }
    .joint-element .${invalidPathClassName} {
        stroke: ${invalidColor};
        fill: ${invalidColor};
        fill-opacity: 0.2;
    }
    @keyframes dash {
        to {
            stroke-dashoffset: 0;
        }
    }
    @keyframes stroke {
        to {
            stroke: ${blueColor};
        }
    }
`);


function StartLoad() {
    space.nodes.forEach(node => {
        nodeType = node.type;
        const LoadNode = createNode(node.id);
        LoadNode.position(node.x, node.y);
    });

    nodeType = 1;

    let maxNumber = 0;
    // перебираем все узлы с id в формате N00001, N00002 и т.д.
    space.nodes.forEach(function(node) {
        // извлекаем числовую часть id
        const number = parseInt(node.id.slice(1));
        // сравниваем с максимальным значением
        if (number > maxNumber) {
            maxNumber = number;
        }
    });

    nextId = maxNumber + 1;

    space.links.forEach(link => {
        const sourceNode = link.from;
        const targetNode = link.to;
        createLink(sourceNode, targetNode, getColorLink(link));    
    });

}


function getColorLink(link) {
    let outColor = outlineColor;
    if (link.type === 1) {
        if (link.setting.weight > 0) outColor = '#009926';
        else outColor = '#0022c9';
    } else if (link.type === 2) outColor = outlineColor;
    else if (link.type === 3) outColor = '#FFD700';
    else if (link.type === 4) outColor = '#800080';

    return outColor;
};




StartLoad();
let linkStyle = getLinkStyle();

paper.svg.prepend(styles);
paper.svg.prepend(linkStyle);

const { width, height } = paper.getComputedSize();

StartEditor();

paper.unfreeze({ afterRender: () => paper.hideTools() });
