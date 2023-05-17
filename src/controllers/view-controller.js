class ViewController extends Controller {
    startListening() {
        const { paper } = this.context;

        this.listenTo(paper, {
            'cell:pointerdown': selectSource,
            'blank:pointerdown': unSelect,
            'element:mouseenter': selectEnd,
            'element:mouseleave': hidePathOnMouseLeave,
        });
    }
}

let selectStart;
let selectLink;

function selectSource(cellView, evt, x, y) {

    linkLabel.innerText = 'Link';
    nodeLabel.innerText = 'Node';

    if (evt.model.isLink()) {
        if (selectStart) joint.highlighters.mask.remove(selectStart, highlightId);
        if (selectLink) joint.highlighters.addClass.remove(selectLink, pathMemberHighlightId);
        selectStart = null;
        joint.highlighters.addClass.add(evt, 'line', pathMemberHighlightId, {
            className: pathMemberClassName
        });

        // Переключатель типа в положение выбранного синапса
        const linkSpace = space.links.find(l => l.id === evt.model.id);
        if (linkSpace) {
            radioLink[linkSpace.type - 1].checked = true;
            linkType = linkSpace.type;
            linkSetting = linkSpace.setting;
            changeRadioLink();
            SetSettingLink();
            linkLabel.innerText = `Link ( ${evt.model.id} )`;
            selectLink = evt;
        }


        listElement.querySelectorAll('ul ul').forEach(ul => {
            ul.style.color = outlineColor;
            if (ul.innerText.split('\n')[0] === evt.model.id){

                ul.style.color = blueColor;
                Array.from(ul.parentNode.children).forEach(chil => {
                    chil.classList.add('open');
                })
  
                ul.parentElement.parentNode.children[0].classList.add('open');
                ul.parentElement.parentNode.children[1].classList.add('open');
                ul.parentElement.parentElement.parentNode.children[0].classList.add('open');
                ul.parentElement.parentElement.parentNode.children[1].classList.add('open');
                ul.parentElement.parentElement.parentNode.children[0].children[1].classList.add('open');
                ul.parentElement.parentElement.parentNode.children[1].children[1].classList.add('open');
                ul.parentElement.parentElement.parentElement.parentNode.children[0].classList.add('open');
            }            
        });


    } else {
        if (selectStart) joint.highlighters.mask.remove(selectStart, highlightId);
        if (selectLink) joint.highlighters.addClass.remove(selectLink, pathMemberHighlightId);
        joint.highlighters.mask.add(evt, 'body', highlightId, startAttrs);
        listElement.querySelectorAll('ul ul').forEach(ul => {
            ul.style.color = outlineColor;
            if (ul.innerText.split('\n')[0] === evt.model.id){
                ul.style.color = blueColor;
            }            
        });

        const nodeSpace = space.nodes.find(n => n.id === evt.model.id);
        if (nodeSpace){
            nodeType = nodeSpace.type;
            NodeSetting = nodeSpace.setting;
            radioNode[nodeType - 1].checked = true;
            changeRadioNode();
            SetSettingNode();
            nodeLabel.innerText = `Node ( ${evt.model.id} )`;
        }

        selectStart = evt;
        selectLink = null;
    }

}

function unSelect(cellView, evt, x, y){
    if (evt.button === 0){
        if (selectStart) joint.highlighters.mask.remove(selectStart, highlightId);
        if (selectLink) joint.highlighters.addClass.remove(selectLink, pathMemberHighlightId);
        selectStart = null;
        selectLink = null;
        listElement.querySelectorAll('ul ul').forEach(ul => {
            ul.style.color = outlineColor;            
        });
        linkLabel.innerText = 'Link';
        nodeLabel.innerText = 'Node';
    }
}


function selectEnd() {
    
}

function hidePathOnMouseLeave() {
    
}
