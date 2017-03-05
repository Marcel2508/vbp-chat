var chats = document.createElement("script");
chats.type="text/javascript";
//chats.integrity = "sha256-lDaoGuONbVHFEV6ZW3GowBu4ECOTjDE14hleNVBvDW8=";
chats.crossOrigin="anonymous";
chats.src="http://chat.sol4it.de/cdn/chat.js";
chats.onload = function(){
    chatStartup();
};
document.body.appendChild(chats);