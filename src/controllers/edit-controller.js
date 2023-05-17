class EditController extends Controller {
    startListening() {
        const { graph, paper } = this.context;
    
        this.listenTo(graph, {
            'change:source': replaceLink,
            'change:target': replaceLink,
            'change:position': changePosition,
        });
    
        this.listenTo(paper, {
            'link:mouseenter': showLinkTools,
            'link:mouseleave': hideLinkTools,
            'element:mouseenter': showElementTools,
            'element:mouseleave': hideElementTools,
            'element:pointerdblclick': removeElement,
            'blank:pointerdblclick': addElement,
        });

        paper.on('blank:pointerdown', () => {
            $(':focus').blur();
        });


      
        // Add mouse wheel zoom
        paper.on('blank:mousewheel', (evt, x, y, delta) => {
            const zoomLevel = paper.scale().sx + delta / 30;
            if (zoomLevel > 0.1 && zoomLevel < 3) {

                paper.scale(zoomLevel, zoomLevel);
                panOffset.x = -x*zoomLevel+evt.offsetX;
                panOffset.y = -y*zoomLevel+evt.offsetY;
                paper.translate(panOffset.x , panOffset.y );

                localStorage.setItem('paperPosition', JSON.stringify(paper.translate()));
                localStorage.setItem('paperScale', JSON.stringify(paper.scale()));
            }
        });

        paper.on('cell:mousewheel', (cellView, evt, x, y, delta) => {
            const zoomLevel = paper.scale().sx + delta / 30;
            if (zoomLevel > 0.1 && zoomLevel < 3) {

                paper.scale(zoomLevel, zoomLevel);
                panOffset.x = -x*zoomLevel+evt.offsetX;
                panOffset.y = -y*zoomLevel+evt.offsetY;
                paper.translate(panOffset.x , panOffset.y );

                localStorage.setItem('paperPosition', JSON.stringify(paper.translate()));
                localStorage.setItem('paperScale', JSON.stringify(paper.scale()));
            }
        });
    
        //panning with middle mouse button
        let isPanning = false;
        let panStart = null;
        let panOffset = { x: paper.translate().tx, y: paper.translate().ty };
        
        paper.on('blank:pointerdown', (evt) => {
            if (evt.button === 1) {
                isPanning = true;
                panStart = { x: evt.clientX, y: evt.clientY };
                paper.el.style.cursor = 'move';
            }
        });
        paper.on('blank:pointerup', (evt) => {
            if (evt.button === 1) {
                isPanning = false;
                panStart = null;
                paper.el.style.cursor = 'default';              
            }
        });
        paper.on('blank:pointermove', (evt) => {
            if (isPanning) {
                const dx = evt.clientX - panStart.x;
                const dy = evt.clientY - panStart.y;
                panOffset.x += dx;
                panOffset.y += dy;
                paper.translate(panOffset.x, panOffset.y);
                panStart = { x: evt.clientX, y: evt.clientY };
                localStorage.setItem('paperPosition', JSON.stringify(paper.translate()));
            }
        });
    }
}

function showLinkTools(_context, linkView, _evt) {
    linkView.showTools();
}

function hideLinkTools(_context, linkView) {
    linkView.hideTools();
}

function showElementTools(_context, elementView, _evt) {
    $(':focus').blur();
    elementView.showTools();
}

function hideElementTools(_context, elementView) {
    elementView.hideTools();
}

function replaceLink({ createLink }, link, _collection, opt) {
    const sourceId = link.get('source').id;
    const targetId = link.get('target').id;
    if (opt.ui && sourceId && targetId) {  
        link.remove();
        const idLink = [sourceId, targetId].join('-');
        const index = space.links.findIndex(link => link.id === idLink);
        if ((index === -1) && (targetId[0] != 'S') && (targetId[0] != 'M')){
            const l = {id: idLink, from: sourceId, to: targetId, type: linkType, setting: linkSetting }
            space.links.push(l);
            createLink(sourceId, targetId, getColorLink(l));
            localStorage.setItem("space", JSON.stringify(space));
            reFreshInspector();
        }
    }
    refreshLink();
}

function removeElement({}, elementView) {
    elementView.model.remove();
    const nodeId = elementView.model.id;
    const nodeIndex = space.nodes.findIndex(node => node.id === nodeId);
    if (nodeIndex !== -1) {
        space.nodes.splice(nodeIndex, 1);
        space.links = space.links.filter(link => link.from !== nodeId && link.to !== nodeId);
    }
    localStorage.setItem("space", JSON.stringify(space));
    reFreshInspector();
}

function addElement({ createNode, size }, _evt, x, y) {
        const nodeId = getNodeId();
        space.nodes.push({id: nodeId, x: x - size / 2, y: y - size / 2, type: nodeType, setting: NodeSetting });
        const node = createNode(nodeId);
        node.position(x - size / 2, y - size / 2);
        localStorage.setItem("space", JSON.stringify(space));
        reFreshInspector();
}

function changePosition (_context, element) {

    const index = space.nodes.findIndex(item => item.id === element.id);
        if (index !== -1){
            space.nodes[index].x = element.changed.position.x;
            space.nodes[index].y = element.changed.position.y;
            localStorage.setItem("space", JSON.stringify(space));
        }

    refreshLink();
}

function refreshLink(){
    const pairedLinks = getPairedLinks(space);
    pairedLinks.forEach(function(linkId){
        const link = graph.getCell(linkId);
        if (link){             
        const linkSpace = space.links.find(l => l.id === linkId);
        if (linkSpace) {
            const fromNode = space.nodes.find(node => node.id === linkSpace.from);
            const toNode = space.nodes.find(node => node.id === linkSpace.to);
            if (fromNode && toNode) {
                const dxdy = getCoordsOffset(fromNode, toNode, 5);
                link.set('source', {
                    id: fromNode.id,
                    anchor: { name: 'center', args: { rotate: true, dx: dxdy.x, dy: dxdy.y }},
                });
                link.set('target', {
                    id: toNode.id,
                    anchor: { name: 'center', args: { rotate: true, dx: dxdy.x, dy: dxdy.y }},
                });
            }
        }}
    }); 
}

function getPairedLinks(space) {
    const pairedLinks = [];
    space.links.forEach(link => {
      const pairedLink = space.links.find(l => l.id !== link.id && l.from === link.to && l.to === link.from);
      if (pairedLink) {
        pairedLinks.push(link.id);
      }
    });
    return pairedLinks;
}

function getCoordsOffset(pos1, pos2, offset){
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const unitDx = dx / length;
    const unitDy = dy / length;
    const offsetX = unitDy * offset;
    const offsetY = -unitDx * offset;
    const sourceCoords = { x: offsetX, y: offsetY };
    return sourceCoords;
}