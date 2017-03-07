"use strict";
const express = require("express");
const app = express();
const http = require("http").Server(app);
const helmet = require("helmet");
const compression = require("compression");
const io = require("socket.io")(http);
const md5 = require("md5");
const moment = require("moment");
const fs = require("fs");
const request = require("request");
const jsdom = require("jsdom");

process.chdir(__dirname);

var clients = [];
var messages = [];

var maintenanceConfig = JSON.parse(fs.readFileSync("maintenance.json"));

var pendingAuthChallenges = [];

app.use(compression());
app.use(helmet());
app.use("/cdn",express.static("cdn/"));

app.get("/",(req,res)=>{
    res.status(200);
    res.send("");
    res.end();
});

if(maintenanceConfig.maintenance){
    console.log("Started in MAINTENANCE mode!");
}


io.on("connection",(socket)=>{
    console.log("Connection:",socket.request.headers['x-forwarded-for']);
    //console.log(clients.length);
    if(maintenanceConfig.maintenance){
        socket.emit("welcome",JSON.stringify({status:"MAINTENANCE",message:maintenanceConfig.status,checkDelay:maintenanceConfig.checkDelay}));
        socket.disconnect();
        return;
    }
    else{
        //console.log("chek IP AUTH")
        //console.log("IP1:",socket.request.headers['x-forwarded-for']);
        //if(_arrayAmount((it)=>{return it.ip==socket.request.headers['x-forwarded-for'];})==1){
            let cl = clients.find((it)=>{return it.ip==socket.request.headers['x-forwarded-for'];});
            if(cl){
            
            //console.log("found IP");
            //console.log(cl);
                

            if(cl.socket&&cl.socket.connected)cl.socket.disconnect();
            cl.socket=socket;
            cl.updated=Date.now();

            //console.log(cl.socket.id,socket.id);

            //console.log("OK LOGIN ",cl);
            clearTimeout(cl.removeTimeout);
            socket.emit("welcome",JSON.stringify({status:"OK",myHash:cl.hash,myUser:cl.name,utype:cl.type}));
        }
        else
            socket.emit("welcome",JSON.stringify({status:"AUTH"}));
    }
    socket.on("authenticate",(msg)=>{
        var datap = JSON.tryParse(msg);

        //console.log("auth packet");
        //console.log(datap);
        if(datap.error){
            console.error("FATAL ERROR! ",socket.request.headers['x-forwarded-for']);
            console.error(datap);
        }
        else{
            //console.log("Auth try: \n",datap);
            if(datap.type=="cookie"){
                let cl = clients.find((clt)=>{return clt.secret=datap.secret;});
                if(false){
                    //console.log("cookie Auth",datap);
                    if(cl.socket&&cl.socket.connected)cl.socket.disconnect();
                    cl.socket = socket;
                    cl.updated=Date.now();
                    clearTimeout(cl.removeTimeout);
                    //console.log("COOKIE LOGIN ",cl);
                    socket.emit("command",JSON.stringify({command:"authConfirm",secret:cl.secret,myHash:cl.hash,myUser:cl.name,utype:cl.type}));
                }else{
                    //console.log("Possible Security Breach! ",socket.handshake.address.address,msg);
                    socket.emit("welcome",{status:"AUTH"});
                }
            }
            else if(datap.type=="loggedIn"){
                let cl = clients.find((clt)=>{return clt.name==datap.username;})
                if(cl){
                    socket.emit("command",JSON.stringify({command:"authBreak"}));
                    //socket.emit("command",JSON.stringify({command:"authConfirm",secret:cl.secret,myHash:cl.myHash}));
                }
                else{

                    getUserAuthChallenge((challengeLink)=>{
                        //console.log("Sending challenge: ",challengeLink);
                        let ind = pendingAuthChallenges.push({timestamp:Math.floor(Date.now()/1000),challenge:challengeLink,"socket":socket,"userLink":datap.userLink,"username":datap.username})-1;
                        pendingAuthChallenges[ind].to=setTimeout((()=>{pendingAuthChallenges.splice(pendingAuthChallenges.indexOf(this.elm),1);}).bind({elm:pendingAuthChallenges[ind]}),10000);
                        console.log("Created Challenge Request",pendingAuthChallenges);
                        socket.emit("command",JSON.stringify({command:"authChallenge",challenge:challengeLink}));
                    });

                    //console.log("New con try");
                    //var cl = clients[clients.push({"name":datap.username,updated:Date.now(),"hash":md5(Date.now()+Math.random()),"secret":md5(Date.now()+Math.random()),"socket":socket,updated:Date.now(),type:"user"})-1];
                    //console.log("loggedIn LOGIN ",cl);
                    //socket.emit("command",JSON.stringify({command:"authConfirm",secret:cl.secret,myHash:cl.hash,utype:cl.type}));
                }
            }
            else if(datap.type=="guest"){
                let cl = clients.find((clt)=>{return clt.name==datap.username;});
                if(cl){
                    socket.emit("command",JSON.stringify({command:"authBreak"}));
                    //socket.emit("command",JSON.stringify({command:"authConfirm",secret:cl.secret,myHash:cl.myHash}));
                }
                else{
                    if(datap.username.indexOf("@")!=-1&&datap.username.indexOf(".")>datap.username.indexOf("@")){
                        let cl = clients[clients.push({"name":datap.username,updated:Date.now(),"hash":md5(Date.now()+Math.random()),"secret":md5(Date.now()+Math.random()),"ip":socket.request.headers['x-forwarded-for'],"socket":socket,updated:Date.now(),type:"guest"})-1];
                        //console.log("Guest LOGIN ",cl);                  
                        socket.emit("command",JSON.stringify({command:"authConfirm",secret:cl.secret,myHash:cl.hash,myUser:cl.name,utype:cl.type}));
                    }
                    else{
                        socket.emit("command",JSON.stringify({command:"authBreak"}));
                    }
                }
            }

        }
    });
    socket.on("command",(msg)=>{
        let datap = JSON.tryParse(msg);
        if(datap.error){
            console.error("FATAL ERROR! ",socket.request.headers['x-forwarded-for']);
            console.error(datap);
        }
        else{
            let cl = clients.find((clt)=>{return clt.socket&&clt.socket.id==socket.id;});
            if(cl){
                if(datap.command=="getRecentMessages"){
                    //console.log("got grm");
                    //console.log("getRecentMessages",datap);
                    socket.emit("command",JSON.stringify({"command":"setRecentMessages","messages":messages}));
                }
            }

            if(datap.command=="authChallengeComplete"){
                checkAuthChallengeResponse(socket,(status,newName)=>{
                    //console.log("Got challenge response");
                    if(status==true){
                        //console.log("Auth challenge OK!");
                        let cl1 = pendingAuthChallenges.find((pac)=>{return pac.socket&&pac.socket.id==socket.id;});
                        let cl = clients[clients.push({"name":newName,updated:Date.now(),"hash":md5(Date.now()+Math.random()),"secret":md5(Date.now()+Math.random()),"socket":socket,updated:Date.now(),"ip":socket.request.headers['x-forwarded-for'],type:"user"})-1];
                        //console.log("Auth challenge OK", cl);
                        socket.emit("command",JSON.stringify({command:"authConfirm",secret:cl.secret,myHash:cl.hash,myUser:cl.name,utype:cl.type}));
                    }
                    else{
                        console.log();
                        socket.emit("command",{"command":"challengeError","description":"Challenge not ok!"});
                    }
                });
            }
        }
    });
    socket.on("message",(msg)=>{
        let cl = clients.find((clt)=>{return clt.socket&&clt.socket.id==socket.id;});
        if(cl){
            if(msg.length>512||cl.type=="guest"&&(Math.floor(Date.now/1000))-cl.lastMsg<25)return;
            let msgo = {sender:{name:cl.name,hash:cl.hash},message:msg,timestamp:Math.floor(Date.now()/1000),timeString:moment().format("HH:mm")+" Uhr"};
            messages.push(msgo);
            cl.lastMsg=Math.floor(Date.now()/1000);
            clients.forEach((cl1)=>{
                if(cl1.socket)
                    cl1.socket.emit("message",JSON.stringify({sender:{name:cl.name,hash:cl.hash},message:msgo}));
            });
            checkClearMessages();
        }
        //console.log("message",messages);
    });

    socket.on("disconnect",()=>{
        let cl = clients.find((clt)=>{return clt.socket&&clt.socket.id==socket.id;});
        if(cl){
            //console.log("socket closed");
            cl.socket=null;
            cl.removeTimeout=setTimeout((()=>{console.log("remove client");clients.splice(clients.indexOf(clients.find((cli)=>{return cli.hash==this.hash;})),1);}).bind({hash:cl.hash}),30000);
        }
    });

});


function getUserAuthChallenge(_callback)
{
    var rndPage = Math.floor((Math.random() * 500) + 1);
    request({url:"http://vb-paradise.de/index.php/MembersList/?pageNo="+rndPage,headers:{"User-Agent":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36"}},(err,resp,body)=>{
        if(err){
            console.error("FATAL AUTH CHALLENGE ERROR! #1");
            console.error(err);
            _callback(null);
        }
        else{
            jsdom.env(body,(err2,window)=>{
                if(err2){
                    console.error("FATAL AUTH CHALLENGE ERROR! #2");
                    console.error(err2);
                    _callback(null);
                }
                else{
                    var listElements = window.document.getElementsByClassName("containerHeadline");
                    var rndUser = Math.floor((Math.random() * 29) + 1);
                    //console.log(listElements,rndUser,listElements[rndUser]);                    
                    var user = listElements.item(rndUser).children.item(0).children.item(0);
                    _callback(user.href);
                }
            });
        }
    });
}

function checkAuthChallengeResponse(socket,_callback)
{
    var cl = pendingAuthChallenges.find((pac)=>{return pac.socket&&pac.socket.id==socket.id;});
    console.log("CheckChallenge: ",cl);
    if(cl){
        //console.log("found client, checking: ",cl.userLink);
        request({"url":cl.userLink,"headers":{"User-Agent":"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36"}},(err,resp,body)=>{
            if(err){
                console.error("FATAL AUTH CHALLENGE CHECK ERROR! #1");
                console.error(err);
                _callback(false);
            }
            else{
                jsdom.env(body,(err2,window)=>{
                    if(err2){
                        console.error("FATAL AUTH CHALLENGE CHECK ERROR! #2");
                        console.error(err2);
                        _callback(false);
                    }
                    else{
                        //console.log("Autch Check DOM 2");
                        console.log(body);
                        var gul = window.document.getElementsByClassName("userLink");
                        //console.log(gul.length);
                        if(gul.length>0){
                            var url1=gul.item(0).href;
                            var url2=cl.challenge;
                            var url1a = url1.split("?s=");
                            if(url1a.length>1)url1a.pop();
                            url1=url1a.join();
                            var url2a = url2.split("?s=");
                            if(url2a.length>1)url2a.pop();
                            url2=url2a.join();

                            var retName = cl.userLink.split("-");
                            retName=retName[retName.length-1].replace(/\/\?s=\w*/,"").replace("/","");

                            console.log("Auth check: ",url1,url2,"-",cl.userLink);
                            if(url1==url2)_callback(true,retName);
                            else { console.log("challenge -wronk link"); _callback(false);}
                        }
                        else {console.log("challenge - no gul");_callback(false);}
                    }
                });
            }
        });   
    }
    else{
        console.log("Challenge - no Pending");
        _callback(false);
    }
}


function checkClearMessages()
{
    if(messages.length>50){
        messages.splice(0,25);
    }
}


http.listen(9091,()=>{
    console.log("CHAT-Server Listening on 9091");
});

function _arrayAmount(_cb)
{
    var am = 0;
    clients.forEach((it,ind)=>{console.log(it,ind);if(_cb(it,ind))am++;});
    return am;
}

JSON.tryParse = function(inp){
    var data = null;
    try{
        data = JSON.parse(inp);
    }catch(ex){
        data = {"error":true,"description":"JSON PARSE ERROR","additional":ex};
    }
    return data;
};