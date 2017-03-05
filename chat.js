var socket=null;
var openBtn = null;
var chatWindow = null;
var chatLoaded=false;
var chatOpen=false;
var chatMe = null;
var chatAuth = false;
var chatAuthT=false;
var chatInMainM = false;
var lastMsg = 0;
var isGuest=false;

function chatStartup()
{
    console.log("CHAT: Main Script loaded. Injecting Dependencies");
    var icons = document.createElement("link");
    icons.rel = "stylesheet";
    icons.type="text/css";
    icons.href="http://fonts.googleapis.com/icon?family=Material+Icons";
    //icons.integrity = "sha384-cCmnk9/Usyhniy2w3rNpYwtigiEbEkWNbjKL8m3+JCdq3ldcPY+fwOhXFsz+iE0P";
    icons.crossOrigin="anonymous";
    document.body.appendChild(icons);

    var style = document.createElement("link");
    style.rel = "stylesheet";
    style.type="text/css";
    style.href="http://chat.sol4it.de/cdn/style.css";
    //style.integrity = "sha384-cCmnk9/Usyhniy2w3rNpYwtigiEbEkWNbjKL8m3+JCdq3ldcPY+fwOhXFsz+iE0P";
    style.crossOrigin="anonymous";
    document.body.appendChild(style);

    var socketio = document.createElement("script");
    socketio.type="text/javascript";
    //socketio.integrity = "sha256-lDaoGuONbVHFEV6ZW3GowBu4ECOTjDE14hleNVBvDW8=";
    socketio.crossOrigin="anonymous";
    socketio.onload = startChat;
    socketio.src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.7.3/socket.io.js";
    document.body.appendChild(socketio);

    JSON.tryParse = function(inp){
        var data = null;
        if(typeof inp == "object")return inp;
        try{
            data = JSON.parse(inp);
        }catch(ex){
            data = {"error":true,"description":"JSON PARSE ERROR","additional":ex,"original":inp};
        }
        return data;
    };
}

function lastMsgAnimation()
{
    var tb = document.getElementById("chatInput");
    if(lastMsg>0){
        tb.setAttribute("placeholder","Noch "+lastMsg+" Sekunden");
        lastMsg--;
    }
    else{
        tb.setAttribute("placeholder","");
    }
}

function startChat()
{
    openBtn = document.createElement("div");
    openBtn.innerHTML = '<a><i class="material-icons">chat</i><div id="pendingMessageCount"></div></a>';
    openBtn.className = "chat-open";
    document.body.appendChild(openBtn);
    openBtn.addEventListener("click",(elem, event)=>{
        showChat();
    });

    chatWindow=document.createElement("div");
    chatWindow.innerHTML = '<div class="chat-title">VB-Paradise.de Chat<a class="right" onclick="hideChat(this,event);"><i class="material-icons">close</i></a></div><div class="chat-messages" id="chatOutput"></div><input type="text" id="chatInput" class="chat-textbox" onkeypress="return chatSendMessage(event);" maxlength="512"/><button id="chatSend" class="chat-send" onclick="chatSendMessage();"><i class="material-icons">send</i></button><div class="chat-cb"></div>';
    chatWindow.className="chat-window";
    document.body.appendChild(chatWindow);

    if(localStorage.getItem("wartCheckNext")){
        if(Math.floor(Date.now()/1000)-localStorage.getItem("wartCheckNext")>0){
            localStorage.removeItem("wartCheckNext");
            localStorage.removeItem("wartMessage");
            localStorage.removeItem("wartMessageDelay");
        }
        else{
            console.log("CHAT: Stay in Maintenance...");
            showMaintenanceInfo({checkDelay:localStorage.getItem("wartMessageDelay"),message:localStorage.getItem("wartMessage")});
            return;
        }
    }
    //console.log("ALL DONE. Start Socket");
    socket = io.connect("http://chat.sol4it.de");
    socket.on("welcome",(msg)=>{
        //console.log("GOT welcome");
        var resp = JSON.tryParse(msg);
        if(resp.error){
            console.error("CHAT: Error with welcome Packet!");
            console.error("CHAT:",resp);
        }
        else{
            switch(resp.status){
                case "AUTH":
                    if(chatAuthT){localStorage.removeItem("chatAuthenticate");}
                    makeAuthLogin(resp);
                    break;
                case "MAINTENANCE":
                    showMaintenanceInfo(resp,socket);
                    break;
                case "OK":
                    //console.log("OK AUTH");
                    if(resp.utype=="guest")isGuest=true;
                    chatAuth=true;
                    chatMe = resp.myHash;
                    chatClientType=resp.type;
                    break;
                default:
                    console.error("CHAT: Undefined Chat Status!");
                    break;
            }

        }
    });
    socket.on("message",(msg)=>{
        var resp = JSON.tryParse(msg);
        if(resp.error){
            console.error("CHAT: Error with message Packet!");
            console.error("CHAT:",resp);
        }
        else{
            if(!chatLoaded)
                incPendingMessages();
            else{
                displayChatMessage(resp.sender,resp.message,resp.sender.hash==chatMe);
                if(!chatOpen)incPendingMessages();
            }
        }
    });
    socket.on("command",function(msg){
         var resp = JSON.tryParse(msg);
        if(resp.error){
            console.error("CHAT: Error with message Packet!");
            console.error("CHAT:",resp);
        }
        else{
            switch(resp.command){
                case "setRecentMessages":
                //console.log("srm");
                    if(chatMe){
                        resp.messages.forEach(function(m){
                            if(m.sender.hash == chatMe)displayChatMessage(m.sender,m,true);
                            else displayChatMessage(m.sender,m,false);
                        });
                    }
                    break;
                case "authConfirm":
                    if(!chatLoaded){
                        console.log("CHAT: Authentication Success!");
                        if(resp.utype=="guest")isGuest=true;
                        chatAuth=true;
                        chatMe=resp.myHash;
                        localStorage.setItem("chatAuthenticate",JSON.stringify({timestamp:Math.floor(Date.now()/1000),secret:resp.secret}));
                        chatWindow.innerHTML = '<div class="chat-title">VB-Paradise.de Chat<a class="right" onclick="hideChat(this,event);"><i class="material-icons">close</i></a></div><div class="chat-messages" id="chatOutput"></div><input type="text" id="chatInput" class="chat-textbox" onkeypress="return chatSendMessage(event);" maxlength="512"/><button id="chatSend" class="chat-send" onclick="chatSendMessage();"><i class="material-icons">send</i></button><div class="chat-cb"></div>';
                        if(chatOpen){initChat();chatLoaded=true;}
                    }
                    break;
                case "authBreak":
                    console.error("CHAT: System detected Auth Break.");
                    chatWindow.innerHTML = "<div class='chat-title'>VB-Paradise.de Chat<a class='right' onclick='hideChat(this,event);'><i class='material-icons'>close</i></a></div><div class='authMaker'><h3>Security Error</h3>Ein Fataler Sicherheitsverstoß ist aufgetreten. Ihr Client wird blockiert!</span></div>";
                    break;
                case "authChallenge":
                    chatAuthChallenge(resp.challenge);
                    break;
                case "challengeError":
                    chatWindow.innerHTML = "<div class='chat-title'>VB-Paradise.de Chat<a class='right' onclick='hideChat(this,event);'><i class='material-icons'>close</i></a></div><div class='authMaker'><h3>Security Error</h3>Fataler Authentication Fehler!</span></div>";
                    console.error("Login Challenge Error!");
                    break;
            }
        }
    });

    socket.on("disconnect",function(){
        socket.disconnect();
        if(!chatInMainM)
            chatWindow.innerHTML = "<div class='chat-title'>VB-Paradise.de Chat<a class='right' onclick='hideChat(this,event);'><i class='material-icons'>close</i></a></div><div class='authMaker'><h3>Parallelitäts Fehler</h3><span class='chat-span-2'>Dieser Chat ist nicht mehr Verbunden. Hast du villeicht einen anderen Tab mit selbigem auf?</span></div>";

    });
}


function chatAuthChallenge(challenge)
{
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            console.log(this.responseText);
            socket.emit("command",JSON.stringify({command:"authChallengeComplete"}));
        }
    };
    xhttp.open("GET", challenge, true);
    xhttp.send();
}

function chatSendMessage(ev)
{
    if(!(!ev||ev.keyCode==13))return;
    if(lastMsg!=0)return;
    var tb = document.getElementById("chatInput");
    if(tb.value!=""){
        socket.emit("message",tb.value);
        tb.value="";
        if(isGuest)lastMsg=30;
    }
}

function showMaintenanceInfo(st,socket)
{
    chatInMainM=true;
    chatWindow.innerHTML = "<div class='chat-title'>VB-Paradise.de Chat<a class='right' onclick='hideChat(this,event);'><i class='material-icons'>close</i></a></div><div class='authMaker'><h3>Wartung</h3><br/><span>Leider wird das Chat-System derzeit gewartet. Bitte habe ein wenig Gedult und versuche es später wieder.</span><span class='chat-span-2'>"+escapeHtml(st.message)+"</span></div>";
    localStorage.setItem("wartCheckNext",Math.floor(Date.now()/1000)+parseInt(st.checkDelay));
    localStorage.setItem("wartMessage",st.message);
    localStorage.setItem("wartMessageDelay",st.checkDelay);
    if(socket)socket.disconnect();
}

function displayChatMessage(sender,message,selfm)
{
    var msg = document.createElement("div");
    msg.className="chat-message";
    if(selfm){
        msg.innerHTML = "<div class='chat-bubble self'><span class='chat-from'>Du</span><span class='chat-text'>"+escapeHtml(message.message)+"</span><span class='chat-time'>"+escapeHtml(message.timeString)+"</span></div><div class='chat-cb'></div>";
        //msg.innerHTML = "<div class='chat-bubble self'><span class='chat-from'>Du</span><span class='chat-text'>"+escapeHtml(message.message)+"</span><span class='chat-time'>"+escapeHtml(message.timestamp)+"</span></div>";
    }
    else{
        msg.innerHTML = "<div class='chat-bubble'><span class='chat-from'>"+escapeHtml(sender.name)+"</span><span class='chat-text'>"+escapeHtml(message.message)+"</span><span class='chat-time'>"+escapeHtml(message.timeString)+"</span></div><div class='chat-cb'></div>";
        //msg.innerHTML = "<div class='chat-bubble'><span class='chat-from'>"+escapeHtml(sender.name)+"</span><span class='chat-text'>"+escapeHtml(message.message)+"</span><span class='chat-time'>"+escapeHtml(message.timestamp)+"</span></div>";
    }
    var chatW=document.getElementById("chatOutput");
    chatW.appendChild(msg);
    chatW.scrollTop = chatW.scrollHeight;
}

function makeAuthLogin()
{   
    if(localStorage.getItem("chatAuthenticate")){
        var cao = JSON.tryParse(localStorage.getItem("chatAuthenticate"));
        if(cao.error){
            console.error("CHAT: Error with message Packet!");
            console.error("CHAT:",cao);
        }
        else{
            if(Math.floor(Date.now()/1000)-cao.timestamp>1800){localStorage.removeItem("chatAuthenticate");makeAuthLogin();}
            else{
                socket.emit("authenticate",JSON.stringify({"error":false,type:"cookie",secret:cao.secret}));
                chatAuthT=true;
            }
        }
    }
    else if(document.getElementById("userMenu")){
        socket.emit("authenticate",JSON.stringify({"error":false,type:"loggedIn",username:document.getElementById("userMenu").children[0].children[1].innerHTML,"userLink":document.getElementById("userMenu").children[0].href}));
    }
    else{
        chatWindow.innerHTML = "<div class='chat-title'>VB-Paradise.de Chat<a class='right' onclick='hideChat(this,event);'><i class='material-icons'>close</i></a></div><div class='authMaker'><h3>Login</h3><br/><span>Logge dich mit deiner E-Mail Adresse als Gast ein:</span><br/><input type='email' id='chat-login-email' placeholder='name@domain.de'/><br><button id='submit' onclick='chatGuestLogin();'><i class='material-icons'>done</i></button><span class='chat-span-2'>Bitte beachte, dass du als Gast nur alle 30 Sekunden Nachrichten verschicken kannst!<br/><br/>Beleidigungen, Spam oder Sexuelle Inhalte werden mit permanenten Ausschluss aus diesem Chat-System geahndet!</span></div>";
    }
}

/*function getUserLoginSecret()
{
    var secretp = JSON.tryParse(localStorage.getItem("chatAuthenticate"));
    if(secretp.error)return null;
    else if(Math.floor(Date.now()/1000)-secretp.timestamp<1800)return secretp.secret;
    else return null;
}*/

function chatGuestLogin()
{
    var val = document.getElementById("chat-login-email").value;
    if(val.indexOf("@")!=-1&&val.indexOf(".")!=-1)
        socket.emit("authenticate",JSON.stringify({"error":false,type:"guest",username:val}));
    else{
        alert("Bitte gebe eine gültige E-Mail an!");
    }
    //initChat();
}

function incPendingMessages()
{
    if(localStorage.getItem("pendingMessageCount")!=null)localStorage.setItem("pendingMessageCount",parseInt(localStorage.getItem("pendingMessageCount"))+1);
    else localStorage.setItem("pendingMessageCount",1);
    document.getElementById("pendingMessageCount").innerHTML = localStorage.getItem("pendingMessageCount");
}

function initChat()
{
    //console.log("asked for srm");
    socket.emit("command",JSON.stringify({
        "error":false,
        "command":"getRecentMessages"
    }));
    setInterval(lastMsgAnimation,1000);
}

function showChat()
{
    if(!chatLoaded&&chatAuth){
        initChat();
        chatLoaded=true;
    }
    document.getElementById("pendingMessageCount").innerHTML="";
    chatOpen=true;
    chatWindow.classList.add("visible");
    localStorage.removeItem("pendingMessageCount");
}

function hideChat()
{
    chatOpen=false;
    chatWindow.classList.remove("visible");
}


var entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

function escapeHtml (string) {
  return String(string).replace(/[&<>"'`=\/]/g, function (s) {
    return entityMap[s];
  });
}