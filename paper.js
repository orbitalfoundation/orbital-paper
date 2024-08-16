
const isServer = typeof window === 'undefined'

import { log,warn,error } from '../orbital/utils/log.js'

import { Router} from './router.js'

import { logo } from './logo.js'

import { marked } from './marked.esm.js'

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// optional server side document model abstraction
//
// this is useful on the server side only for ssr generation
// it is only invoked if a developer specifically brings up paper on the server side
//
// by doing this extra step if there is javascript that executes in the page construction the page is still valid
// (alternatively the html ascii state could be produced directly onto paper nodes but we'd lose dynamic js effects)
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const nodes = []

function createElement(kind) {
	let node = {
		className: "",
		nodeName:kind,
		classList: {},
		style: {},
		children: [],
		remove: function() {}, // @todo
		replaceChildren: function(child) {
			this.children = [child]
		},
		appendChild: function(child) {
			for(const node of this.children) {
				if(node.id && node.id == child.id) return
			}
			this.children.push(child)
		}
	}
	nodes.push(node)
	return node
}

function getElementById(id) {
	for(const node of nodes) {
		if(node.id == id) return node
	}
	return 0
}

const _paper_document_serverside = {
	createElement,
	getElementById,
	body: createElement("body")
}

const document = isServer ? _paper_document_serverside : window.document

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// update browser dom node
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function _paper_dom_update(sys,paper) {

	let node = paper._dom
	let changed = false

	//
	// ssr may scavenge from the live scene
	// @todo may want to use document.body.query() - although we have uuids that are illegal for html browsers so need to wrap in []
	//

	if(!node) {
		node = document.getElementById(paper.uuid)
		if(node) {
			node._kind = node.nodeName.toLowerCase()
			node._paper = paper
			paper._dom = node
			changed = true
		}
	}

	//
	// force a paper kind
	//
	if(!paper.kind) paper.kind = 'div'

	//
	// if the node changed significantly then discard and remake
	//

	if(!node || node._kind !== paper.kind) {
		if(node) node.remove()
		if(!paper.link) {
			node = document.createElement(paper.kind)
		} else {
			if(!paper.content) paper.content = paper.link
			node = document.createElement("a")
			node.href = paper.link
		}
		node.id = paper.uuid
		node._paper = paper
		node._kind = paper.kind
		paper._dom = node
		changed = true
	}

	//
	// allow dynamic disabling
	//

	if(paper.hasOwnProperty('disabled') && disabled != node.disabled && node) {
		node.disabled = paper.disabled || false
	}

	//
	// for now disallow most other content changes
	// @todo for a reactive service the below do need to test for changes in a more granular fashion
	//

	if(!changed) {
		return node
	}

	//
	// effects - this is an experiment to support custom fancy node types
	//

	_paper_dom_effects(paper)

	// is there any content to inject into the dom node?
	let content = paper.content ? paper.content.trim() : null

	// markdown is an explicit capability built-in for now - arguably it could be a dom_effect node?
	if(paper.markdown && content) {
		content = marked.parse(content)
	}

	// did the content change?
	// content revision in nodes is intended for live change detection but it has not been tested @todo
	if(content && content != node.innerHTML) {
		node.innerHTML = content
	}

	//////////////////////////////////////////////////////////////////////////////////////////
	// apply properties

	// apply css handles strings or hashes, converts to camelcase
	if(paper.css) {
		if (typeof paper.css === 'string' || paper.css instanceof String) {
			// @todo actually best to pick these apart for consistency
			node.style.cssText = paper.css
		} else if (typeof paper.css === 'object') {
			for(const [k,v] of Object.entries(paper.css)) {
				// @todo any point in supporting dash notation at all? note that the dom supports both camelCase and dash
				// k.replace(/-([a-z])/g,(g) => { return g[1].toUpperCase() })
				node.style[k] = v
			}
		}
	}

	// apply classes to the node if changed; handles strings or arrays
	if(paper.classes) {
		let classes = paper.classes || []
		if (typeof paper.classes === 'string' || paper.classes instanceof String) {
			classes = paper.classes.split(' ')
		}
		if(Array.isArray(classes)) {
			for(const c of classes) {
				if(node.classList.contains && node.classList.add) {
					if(!node.classList.contains[c]) node.classList.add(c)
				} else {
					if(!node.classList.includes[c]) node.classList.push(c)
				}
			}
			node.className.split(' ').forEach(c => {
				if(classes.includes(c)) return
				if(node.classList.remove) {
					node.classList.remove(c)
				} else {
					let index = node.classList.indexOf(c)
					if(indexOf>=0) node.classList.splice(index,1)
				}
			})
		}
	}

	// set other props
	// deal with deletion at some point @todo
	if(paper.props) {
		//if(!node._props) node._props = {}
		for(let [k,v] of Object.entries(paper.props)) {
			if(node[k] != v) {
				node[k] = v
				//this.setAttribute(k,v)
			}
		}
	}

	// bind user requested events to browser
	// @todo remove if not visible?
	// @todo allow updates

	if(paper.onclick) {
		node.onclick = (event) => { paper.onclick(event,paper,sys) }
	}

	if(paper.onchange) {
		node.onchange = (event) => { paper.onchange(event,paper,sys) }
	}

	if(paper.onreturn) {
		node.onreturn = (event) => { paper.onreturn(event,paper,sys) }
	}

	if(paper.placeholder) {
		node.placeholder = paper.placeholder
	}

	return node
}

/*

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// unused experimental feature to inject js - but it turns out we don't need it
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function _paper_javascript(paper) {

	const kind = paper.kind

	function setInnerHTML(elm, html) {
	  elm.innerHTML = html;
	  
	  Array.from(elm.querySelectorAll("script"))
		.forEach( oldScriptEl => {
		  const newScriptEl = document.createElement("script");
		  
		  Array.from(oldScriptEl.attributes).forEach( attr => {
			newScriptEl.setAttribute(attr.name, attr.value) 
		  });
		  
		  const scriptText = document.createTextNode(oldScriptEl.innerHTML);
		  newScriptEl.appendChild(scriptText);
		  
		  oldScriptEl.parentNode.replaceChild(newScriptEl, oldScriptEl);
	  });
	}

	if(kind == 'script') {
		log("paper: noticed script")
		node.setAttribute('type', 'text/javascript');
		//node.innerHTML = 'alert(\'hello\')';		
	}

	// look for js
	if(paper.content) {
		const child = node.querySelector('script')
		if(child) {
			log('paper: testing javascript execution')
			log(child,child.getAttribute('type'))
			child.setAttribute('type', 'text/javascript')
		}
	}
}

*/

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// test code to explore an idea of supporting richer primitives
//
// @todo examine creating more built in special effect nodes later such as globes, calendars and so on?
//
// - there are a variety of ways that we could do composite effects
// - we could have a hiearchy of dom nodes to produce an overall effect
// - we could rewrite the node as it passes through
// - we could have real dom custom elements - these have to then be passed to the remote end for rehydration...
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function _paper_dom_effects(paper) {
	if(paper.logo) {
		logo(paper)
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// re-evaluate a given node and all children against a path - largely for visibility
//
// hide or show a node (effectively synchronize the state between our db model and the dom)
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//
// allow an anchor to be specified to remap urls from say /docs/license to /license
// @todo deprecated and not used may remove
//

/*
function _paper_update_anchor(scope) {
	let anchor = scope.anchor || null
	if(blob.paper.anchor) {
		anchor = blob.paper.anchor
		anchor = decodeURI((new URL(anchor)).pathname)
		anchor = anchor.substr(0, anchor.lastIndexOf('/'))
		if(anchor == "/") anchor = null
		scope.anchor = anchor
		console.log("paper: will remove this anchor from subsequent url path requests:",anchor)
	}
}
*/

//
// get the path the user requested - stripping an 'anchor' if any
// never let path be null - just for my own sanity
// @todo anchor may be deprecated as a concept since we are not using it
//

function _paper_get_path(url,anchor=null) {
	//if(!url && isServer) url = "http://arbitrary.server/" // @todo hack test for ssr generation
	let path = decodeURI((new URL(url)).pathname)
	if(anchor && path.startsWith(anchor) ) {
		path = path.substr(anchor.length)
	}
	if(!path || !path.length) path="/"
	return path
}

//
// examine paper nodes to decide if they are in the scene
// if visible then update browser dom node reactively
// and rebind to display
//

function _paper_evaluate(sys,entity,path="/",body=null) {

	// get component
	const paper = entity.paper

	// stuff the uuid into the component for convenience
	paper.uuid = entity.uuid

	// match
	let invisible = true
	if(!paper.match) {
		invisible = false
	} else if(paper.match instanceof RegExp) {
		invisible = paper.match.test(path) ? false : true
	} else if(paper.match.includes('*')) {
		invisible = new RegExp(`^${paper.match.replace(/\*/g, '.*')}$`).test(path) ? false : true
	} else if(path === paper.match) {
		invisible = false
	}

	// if not in the scene then early exit
	if(invisible) {
		if(paper._dom) {
			paper._dom.remove()
			paper._dom_parent = null
		}
		return false
	}

	// console.log("paper path is visible:",paper.uuid,path,paper.match)

	// set paper._dom
	_paper_dom_update(sys,paper)

	const _dom_parent = paper.parent ? document.getElementById(paper.parent) : (body || document.body)

	// if no parent found then bail
	if(!_dom_parent) {
		console.error('paper - parent missing?',paper)
		return
	}

	// insert with ordering
	if(paper._dom_parent !== _dom_parent) {
		let inserted = false
		const children = Array.from(_dom_parent.children)
		for(let i = 0; i < children.length; i++) {
			if((paper.order || 0) < (children[i]._order || 0)) {
				_dom_parent.insertBefore(paper._dom,children[i])
				inserted = true
			}
		}
		if(!inserted) {
			_dom_parent.appendChild(paper._dom)
		}
		paper._dom._order = paper.order || 0
		paper._dom_parent = _dom_parent
	}

	// imperatively advise on update change
	if(paper.onevent) {
		paper.onevent({event:'show',paper,sys})
	}

	// done if no children
	if(!paper.children || !paper.children.length || !Array.isArray(paper.children)) {
		// @todo deal with children deletions
		return
	}

	// promote children
	let counter = 0
	for(let child of paper.children) {
		const _child = {
			// set entity uuid if not set
			uuid: child.uuid ? child.uuid : `${entity.paper.uuid}/${++counter}`,
			// set entity paper component - for now children can be promoted to components @todo may deprecate
			paper: child.paper ? child.paper : child,
		}
		// set parent
		_child.paper.parent = entity.uuid
		//console.log("injecting a child",_child)
		// add child to browser dom also
		_paper_evaluate(sys,_child,path)
	}
}

function _paper_page_change(sys,path) {

	// get all the candidates
	const candidates = sys.query({paper:true})

	// a strategy to reduce screen flicker - doesn't seem to work however @todo
	const frag = false
	const fragment = frag ? document.createDocumentFragment() : document.body

	// very briefly remove all elements
	if(frag) {
		candidates.forEach(entity=>{
			if(entity.paper._dom) {
				entity.paper._dom.remove()
				entity.paper._dom_parent = null
			}
		})
	}

	// reassemble the desired view
	candidates.forEach(entity=>{
		_paper_evaluate(sys,entity,path,fragment)
	})

	// add fragment to document all at once
	if(frag) document.body.appendChild(fragment)
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// late bind - this is an idea to support a wiki like knowledge store
// uuids are mapped to the file system
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function _paper_dynamic_load(sys,path) {

	// for any path attempt to probe it once
	if(!this._probe_map) this._probe_map = {}
	if(this._probe_map[path]) {
		return
	}
	this._probe_map[path] = true

	const parts = path.split('/')

	for(let i = 1; i < parts.length + 1; i++) {

		const uuid = parts.slice(0,i).join("/")
		if(!uuid.startsWith("/")) continue
		//console.log("paper wiki is probing for ",i,uuid,parts.slice(0,i),parts)

		// if the asset does exist then let's not probe
		const results = sys.query({uuid})
		if(results.length) continue

		// do an exploratory search for the asset /index.js which load will stuff on the end of anything with "/"
		sys.resolve({load: `${uuid}/` })

	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// sys has sent us a change on a paper component
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function resolve(blob,sys) {

	if(!sys) return
	if(blob.tick) return
	if(!blob.paper || !blob._entity) return

	// paper operates only on full entities - not transient state
	const entity = blob._entity

	// evaluate single entity if the router is up
	// server mode can drive this as well but it will have to set the current url @todo consider exposing a message for this
	if(isServer || this.router) {
		//console.log("paper - visiting singleton",entity.uuid)
		_paper_evaluate(sys,entity,this.current_path)
		return
	}

	// setup a router once only on client only
	this.router = new Router( (url) => {

		//console.log("paper: router new url",url)

		// this will be the current path until revised
		this.current_path = _paper_get_path(url)

		// update all
		_paper_page_change(sys,this.current_path)

		// this is a feature to allow a more wiki like datastore
		this._paper_dynamic_load(sys,this.current_path)

	})

	// force refresh once only - will occur prior to _paper_evaluate() call
	// @todo arguably this could be deferred till the scene was fully complete but it is hard to know when that is
	this.router.broadcast_change()
}

export const paper_component_observer = {
	_paper_dynamic_load,
	current_path:"/",
	resolve
}

