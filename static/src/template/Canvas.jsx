import React from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import klay from 'cytoscape-klay';
import contextMenus from 'cytoscape-context-menus';
import GraphEdit from './GraphEdit';

import axios from 'axios';
import equal from 'fast-deep-equal';
import RefreshIcon from '@mui/icons-material/Refresh';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import SaveIcon from '@mui/icons-material/Save';

import CyStyle from '../public/cy-style.json';
import 'cytoscape-context-menus/cytoscape-context-menus.css';

// TODO: add uncollapse / unselect without complete reload
// will fix the temp solution of freezing the topmost tree
// want to use https://github.com/iVis-at-Bilkent/cytoscape.js-expand-collapse
// will help with the weird recentering problem with the animation
// looks like it will require changing edge types and classes
cytoscape.use(klay)
cytoscape.use(contextMenus);

/*   Graph view of the data.
    Includes reload, fit to graph, and save current view button.
    Left click to expand node, right click to expand / collapse sidebar of information.
    Right click also gives a context menu to remove elements for visualization purposes. 
*/

   class Canvas extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            canvasElements: CytoscapeComponent.normalizeElements(this.props.elements),
            hasSubtree: false,
            topTree: null,
            removed: null,
            downloadUrl: '',
            fileName: 'graph.png',
            selectedElement: null,
            isGraphEditOpen: false
        };

        // create topTree
        var treeData = []
        for (var { data: d } of this.state.canvasElements) {
            treeData.push(d);
        };
        this.state.topTree = treeData;

        this.showSidebar = this.showSidebar.bind(this);
        this.showSubTree = this.showSubTree.bind(this);
        this.removeSubTree = this.removeSubTree.bind(this);
        this.runLayout = this.runLayout.bind(this);
        this.reloadCanvas = this.reloadCanvas.bind(this);
        this.removeObject = this.removeObject.bind(this);
        this.restore = this.restore.bind(this);
        this.fitCanvas = this.fitCanvas.bind(this);
        this.download = this.download.bind(this);
        this.handleOpen = this.handleOpen.bind(this);
        this.graphHistory = [];
    }

    showSidebar(data) {
        this.props.sidebarCallback(data);
    }

    saveGraphState() {
        this.graphHistory.push(this.cy.json());
    }

    handleSubmit = () => {
        // perform any actions you want on submit
        // then close the dialog by calling handleClose
        this.setState({ isGraphEditOpen: false });
      }

    showSubTree(node) {
        axios.get('/node', {
            params: {
                ID: node.id
            }
        })
            .then(res => {
                if (this.state.hasSubtree && this.state.topTree.includes(node)) {
                    this.removeSubTree();
                }
                this.setState({ hasSubtree: true });
                this.cy.add(res.data);
                this.runLayout();
            })
            .catch(err => {
                console.error(err);
            })
    }

    removeSubTree() {
        this.reloadCanvas();
        this.setState({ hasSubtree: false });
    }

    runLayout() {
        let layout = this.cy.makeLayout({
            name: 'breadthfirst',
            nodeOverlap: 4,
            directed: true,
            nodeDimensionsIncludeLabels: true,
            refresh: 60,
            animate: true,
            animationDuration: 750,
            fit: true,
            padding: 30,
            randomize: false,
            componentSpacing: 40,
            nodeRepulsion: 40000000000000,
        });
        layout.run();
      } 

    reloadCanvas() {
        this.setState({
            canvasElements: CytoscapeComponent.normalizeElements(this.props.elements),
            hasSubtree: false,
            showParticipants: true
        });
        this.cy.elements().remove();
        this.cy.add(this.state.canvasElements);
        this.runLayout();
    }

    removeObject(event) {
        this.setState({ removed: event.target });
        event.target.remove();
    }

    restore() {
        var res = null;
        if (this.state.removed) {
            res = this.state.removed;
            this.setState({ removed: null });
            res.restore();
        }
    }

    handleOpen() {
        this.setState({ isGraphEditOpen: true });
    }

    handleClose = () => {
        this.setState({ isGraphEditOpen: false });
    }

    fitCanvas() {
        this.cy.fit();
    }

    download(event) {
        event.preventDefault();
        const image = this.cy.png({ output: 'blob', bg: 'white', scale: '1.5' });
        const url = URL.createObjectURL(image);
        this.setState({ downloadUrl: url },
            () => {
                this.dofileDownload.click();
                URL.revokeObjectURL(url);
                this.setState({ downloadUrl: '' })
            })
    }

            componentDidMount() {
                this.cy.ready(() => {
                    // left-click 
                    this.cy.on('tap', event => {
                    var eventTarget = event.target;
                    //click background
                    if (eventTarget === this.cy) {
                        // do nothing
                        // click node, show subtree
                    } else if (eventTarget.isNode()) {
                        let node = eventTarget.data();
                        console.log('selectedElement (left-click):', node); // add this line
                        this.showSubTree(node);
                    }
                    });

              /*    We cannot use elementData here, and in the context menu because it is triggering 
                    the GraphEdit.jsx dialog component early. We need to pass data through selectedElement state without activiating the dialog.
              */

            this.cy.on('cxttap', event => {
            if (event.target.isNode()) {
                if (!event.target.hasClass('context-menu-edit')) {
                // do not set selectedElement
                }
            }
            });

            // right-click menu
            var contextMenu = this.cy.contextMenus({
                menuItems: [
                    {
                        id: 'edit-node',
                        content: 'Edit',
                        selector: 'node, edge',
                        classes: 'context-menu-edit',
                        onClickFunction: event => {
                          const elementData = event.target.data();
                          console.log('selectedElement (right-click menu):', elementData);
                          this.setState({ selectedElement: elementData });
                          this.setState({ isGraphEditOpen: true });
                        },
                      },
                    {
                      id: 'remove-node',
                      content: 'Remove',
                      selector: 'node, edge',
                      onClickFunction: (event) => {
                        const nodeId = event.target.id();
                        this.handleNodeDelete(nodeId);
                      },
                    },
                    {
                      id: 'add-outlink',
                      content: 'Add Outlink',
                      selector: 'node[_shape = "diamond"], node[_shape = "ellipse"]',
                      onClickFunction: (event) => {
                        const nodeId = event.target.id();
                        this.handleOutlinkAdd(nodeId);
                      },
                    },
                    {
                      id: 'add-child-event',
                      content: 'Add Child',
                      selector: 'node[_shape = "diamond"], node[_type = "gate"]',
                      onClickFunction: (event) => {
                        const nodeId = event.target.id();
                        this.handleChildEventAdd(nodeId);
                      },
                    },
                    {
                      id: 'add-entity',
                      content: 'Add Entity',
                      selector: 'node[_shape = "ellipse"]',
                      onClickFunction: (event) => {
                        const nodeId = event.target.id();
                        this.handleEntityAdd(nodeId);
                      },
                    },
                    {
                      id: 'add-relation',
                      content: 'Add Relation',
                      selector: 'node[_type = "entity"]',
                      onClickFunction: (event) => {
                        const nodeId = event.target.id();
                        this.handleRelationAdd(nodeId);
                      },
                    },
                    {
                        id: 'undo',
                        content: 'Undo',
                        coreAsWell: true,
                        onClickFunction: (event) => {
                          if (this.graphHistory.length > 1) {
                            // Remove the current state from the history
                            this.graphHistory.pop();
                  
                            // Get the previous state from the history
                            const previousState = this.graphHistory[this.graphHistory.length - 1];
                  
                            // Update the graph with the previous state
                            this.cy.json(previousState);
                            }
                        },
                    },
                ],
            });
        });
    }
    
    componentDidUpdate(prevProps) {
        if (!equal(this.props.elements, prevProps.elements)) {
            this.reloadCanvas();
        }

        if (this.props.selectedElement !== prevProps.selectedElement) {
            console.log('selectedElement (componentDidUpdate):', this.props.selectedElement);
            if (this.props.selectedElement) {
                this.setState({ isGraphEditOpen: true });
            } else {
                this.setState({ isGraphEditOpen: false });
            }
        }
    }

    render() {
        const style = {
            width: 'inherit',
            height: '80vh',
            borderStyle: 'solid',
            position: 'relative'
        };

        const buttonContainer = {
            position: 'absolute',
            top: 185,
            left: 20,
            width: '15px',
            height: '3vh',
            marginLeft: '20px',
        };

        return (
            <div className={this.props.className} style={{ width: 'max-content', display: 'inline-flex' }}>
                <CytoscapeComponent
                    elements={this.state.canvasElements}
                    layout={CyStyle.layout}
                    style={style}
                    stylesheet={CyStyle.stylesheet}
                    cy={(cy) => { this.cy = cy }}
                    maxZoom={2} minZoom={0.87}
                />
                <div style={buttonContainer}>
                    <RefreshIcon type='button' color="action" fontSize='large' onClick={this.reloadCanvas} />
                    <AspectRatioIcon type='button' color="action" fontSize='large' onClick={this.fitCanvas} />
                    <SaveIcon className="button" type="button" color="action" onClick={this.download} />
                    <a style={{ display: "none" }}
                        download={this.state.fileName}
                        href={this.state.downloadUrl}
                        ref={e => this.dofileDownload = e}
                    >download graph image</a>
                </div>
                <GraphEdit
                    selectedElement={this.state.selectedElement}
                    handleClose={() => this.setState({ isGraphEditOpen: false })}
                    isOpen={this.state.isGraphEditOpen}
                    handleOpen={this.handleOpen}
                    handleSubmit={this.handleSubmit}
                    />
                </div>
            );
        }
    }

export default Canvas;