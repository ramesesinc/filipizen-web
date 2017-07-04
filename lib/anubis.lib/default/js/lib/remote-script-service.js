/*********************************
* This must be separated later
**********************************/
function RabbitMQConnectionHandler(_conf) {
	var conf = _conf;
	var ws, client;
	var isConnected = false;
	var handlers = {};

	this.register = function(exchange, key, handlename, callbackHandler) {
		if( handlers[handlename] ==null ) {
			handlers[handlename] = callbackHandler;
		}

		var id = "/exchange/"+exchange+"/"+key;

		if(  isConnected == false) {
			var callbackWrapper = function(o) {
				console.log("firing receive from server");
				var arr = o.body.split("::");
				var hdl = handlers[arr[1]];
				if(hdl!=null) hdl(arr[0]);
			}
			ws = new WebSocket(conf.wshost);
			client = Stomp.over(ws);
			var onConnect =  function(){
				isConnected = true;
				var sub = client.subscribe(id, callbackWrapper);
			};
			var onError = function(e) {
				isConnected = false;
				console.log('Error', e);
			}
			client.connect(conf.username, conf.pwd, onConnect, onError, conf.vhost);			
		}
	}
}


var RemoteScriptInterfaceBuilder = new function() {
	this.build = function( o ) {
		var str = "(function " + o.name + "( p ){ \n";
		str += "     this.proxy = p;\n";
		for( var i=0; i<o.methods.length; i++ ) {
			var m = o.methods[i];
			str += "     this."+m.name + " = function(";
			for( var j=0; j<m.parameters.length;j++ ) {
				if(j>0) str += ",";
				str += "p"+j;	
			}	
			str+= ",handler) {\n";
			str += "          return this.proxy.invoke(\"" + m.name + "\"";
			if(m.parameters.length > 0 ){
				str += ",[";
				for( var j=0; j<m.parameters.length;j++ ) {
					if(j>0) str += ",";
					str += "p"+j;	
				}	
				str += "]";
			}	
			else {
				str += ",null";
			}
			str+=", handler);\n"
			str += "     } \n";	
		}
		str += "})";
		return eval(str);
	}
}

var RemoteScriptConnectionProvider = new function() {
	var conn;
	this.lookup = function( conf ) {
		if(conn!=null) return conn;
		if( conf.connectionClass == null ) 
			throw new Error("connectionClass is required in RemoteScriptConnectionProvider.lookup");
		conn = new window[ conf.connectionClass ](conf);
		return conn;
	}
} 

function RemoteScriptInvoker( _context, name, _connection, _module ) {
	var context = _context;
	var serviceName = name;
	var connection = _connection;
	var module = _module;
	var svc = Service.lookup("RemoteScriptInvokerService", connection, module );
	this.invoke = function(methodName, args, callbackHandler) {
		if(callbackHandler==null)
			throw new Error("Please provide a callbackHandler in RemoteScriptInvoker");	

		var callbackWrapper = function(z) {
			if( typeof callbackHandler == "object" ) {
				callbackHandler.handle(z);
			}	
			else {
				callbackHandler(z);
			}
		}
		var p = {}
		p.serviceName = serviceName;
		p.context = context;
		p.methodName = methodName;
		p.args = args;

		var result = svc.invoke( p );
		if(result.txnid == null ) {
			var conf = result.conf;
			var conn = RemoteScriptConnectionProvider.lookup( result.conf );
			conn.register( conf.exchange, conf.key, conf.handlename, callbackWrapper );
		}
		else {
			callbackWrapper( result.txnid );	
		}
	}
}

var RemoteScriptService = new function() {
	var services = {};
	this.lookup = function( name, connection, module  ) {
		if(services[name]!=null) return services[name];
		var svc = Service.lookup( "RemoteScriptMetaService", connection, module );
	    var info = svc.getScriptInfo( name );	 
	    var func = RemoteScriptInterfaceBuilder.build(info);
	    var invoker = new func( new RemoteScriptInvoker(info.context, info.name, connection, module ) );
	    services[name] = invoker;
	    return invoker;
	}

}

/******************************
*
*******************************/
function RemoteScriptLoadPageHandler(_page) {
	var page = _page;
	if(page==null) 
		throw new Error("Please provide page in RemoteScriptLoadPageHandler");
	this.handle = function(id) {
		window.location.href = page + "?id=" + id;
	}
} 

function RemoteScriptLoadDataHandler( _onload, _connection, _module ) {
	var onload = _onload;
	var connection = _connection;
	var module = _module;
	this.handle = function(id) {
		var svc = Service.lookup( "RemoteScriptDataService", connection, module );
		var o = svc.query(id);
		onload(o);
	}
} 




