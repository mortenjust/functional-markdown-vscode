
function getPublicIp(){
    // https://github.com/sindresorhus/public-ip
    publicIp.v4().then(ip => {
        console.log("V4 publicip: " + ip);	
        if(ip){
            externalIp = ip
        }
    });
    
    publicIp.v6().then(ip => {
        console.log("V6 publicip: " + ip);	
        if(ip){
            externalIp = ip
        }
    });
    }

    
    exports.getPublicIp = getPublicIp