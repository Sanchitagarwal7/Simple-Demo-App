//Using Agora SDKs for signalling
let APP_ID = "487d20fbafc04445a658f20a51aa7173";

let token = null; //token is null for testing in agora sdks for signalling
let uid = String((Math.floor(Math.random()*1000)));

let queryString = window.location.search; //get the search from lobby
let urlParams = new URLSearchParams(queryString);   //get its params

let roomID = urlParams.get('room'); //among those params, search for room value

if(!roomID){ //if no room id is there, then redirect to lobby
    window.location = 'lobby.html';
}

let client;
let channel;

//Declare local and remote streams as null
let localStream = null;
let remoteStream = null;
let peerConnection = null;

//ICE servers for local deployment
const servers = {
    IceServers: [
        {
            urls: ["stun:stun.l.google.com:19302", "stun:stun.l.google.com:5349"]
        }
    ]
}

//init function to initialise the backend when deployed
const init = async () =>{
    //client will create an instance using agoraRTM
    client = await AgoraRTM.createInstance(APP_ID); //APP_ID is in config.js
    await client.login({uid, token}); //then it will login

    //index.html?roomID=1234
    channel = client.createChannel(roomID); //it will either find a channel with this name or create one
    await channel.join(); //join the channel

    channel.on('MemberJoined', handleMemberJoined); //event listener for channel
    channel.on('MemberLeft', handleMemberLeft); //event listener for channel
    client.on('MessageFromPeer', handleMessageFromPeer) //event listener for client

    //ask for camera and mic
    localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
    document.getElementById('user-1').srcObject = localStream; //set it to local stream box
}

const handleMemberJoined = (memberID) => {
    console.log('New Member Joined', memberID);
    createOffer(memberID);
}

const handleMemberLeft = (memberID) => {
    document.getElementById('user-2').style.display = 'none';
    document.getElementById('user-1').classList.remove('smallFrame')
}

const handleMessageFromPeer = (message, memberID) => {
    let msg = JSON.parse(message.text);

    if(msg.type === 'offer'){
        //if the message is an offer, we need to create an answer
        createAnswer(memberID, msg.offer);
    }
    if (msg.type === 'answer'){
        //if the message is an answer, we need to add that answer to sending peer
        addAnswer(memberID, msg.answer);
    }
    if(msg.type === 'candidate'){
        //if the message is an candidate, we need to add ICE candidates to the peer connection

        //Double check if we have a peer connection
        if(peerConnection){
            peerConnection.addIceCandidate(msg.candidate);
        }
    }
}

const constraints = {
    video: {
        facingMode: 'user',
        width: {min: 640, ideal: 1920, max: 1920},
        height: {min: 480, ideal: 1080, max: 1080}
    },
    audio: true
}

const createPeerConnection = async (memberID) =>{
    peerConnection = new RTCPeerConnection(servers); //establish a peer connection with ICE servers

    remoteStream = new MediaStream(); //set remote stream, at this point no stream is coming
    document.getElementById('user-2').srcObject = remoteStream; //but when it will come set it to remote stream box
    document.getElementById('user-2').style.display = 'block'; //when user2 joins this block is no longer hidden

    //when we get remote stream, we need to make local stream into a small box, so we defined the CSS now add that class
    //whenver we get a remote stream
    document.getElementById('user-1').classList.add('smallFrame')

    //extra check before sending local tracks ro peer connection
    //if we dont have local stream then get it
    if(!localStream){
        //ask for camera and mic
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById('user-1').srcObject = localStream; //set it to local stream box
    }

    localStream.getTracks().forEach((track) => { //send tracks of local stream to peer connection
        peerConnection.addTrack(track, localStream);
    })

    peerConnection.ontrack = event => { //tracks from peer connection comes from remote person
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track); //add those tracks to remote stream to display
        })
    }

    peerConnection.onicecandidate = async (event) => { //create ice candidates
        if(event.candidate){ //if there is an ice candidate
            //send that ice candidate with a type from peer (memberID)
            client.sendMessageToPeer({text: JSON.stringify({'type': 'candidate', 'candidate': event.candidate})}, memberID);
        }
    }
}

const createOffer = async (memberID) => { 
    //create offer usually when joining a room

    //creates peer connection and sets local stream and description
    await createPeerConnection(memberID);

    let offer = await peerConnection.createOffer(); //create offer so that people can connect

    await peerConnection.setLocalDescription(offer); //set local description of our local endpoint of peer connection

    //setting local description would start making requests to STUN servers to getting ICE candidates for local

    client.sendMessageToPeer({text: JSON.stringify({'type': 'offer', 'offer': offer})}, memberID); //send offer to another peer with type offer from peer(memberid)
}

const createAnswer = async (memberID, offer) => {

    //Need to setup peer connection on receiving peer also so used a common function for that
    await createPeerConnection(memberID);

    //Now each peer has two descriptions: local description and remote description

    //We already set local description of sending peer in createOffer()
    //We are setting remote description here for receiving peer

    await peerConnection.setRemoteDescription(offer); //set remote description

    let answer = await peerConnection.createAnswer(); //create an answer

    //set local description for receving peer as answer, because the remote decription is the offer
    await peerConnection.setLocalDescription(answer);

    //Now we need to send the answer back to sending peer, for 3-way handshake mechanism
    client.sendMessageToPeer({text: JSON.stringify({'type': 'answer', 'answer': answer})}, memberID); //send answer to another peer with type answer from peer (memberid)
}

const addAnswer = async (memberID, answer) => {
    //If there is no remote description of sending peer already
    if(!peerConnection.currentRemoteDescription){
        peerConnection.setRemoteDescription(answer); //set its remote description to answer
    }
}

const leaveChannel = async () => { 
    //leave channel, a user leaves after 30-40 secs automatically officially
    //but during this time if another user joins the same channel
    //after 30-40 secs that 'new' user will get removed from conversation automatically because of previous
    //user officially leaving the channel, Agora does this thats why we need this function, to quickly remove them

    await channel.leave();  //leave channel
    await client.logout(); //logout the client
}

const toggleCamera = () => {
    //get video tracks of kind video
    let videoTrack = localStream.getTracks().find(track => track.kind === 'video');
    if(videoTrack.enabled===true){ //if video tracks are enabled then disable them and change color
        videoTrack.enabled = false;
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(255, 80, 80)';
    }else{
        videoTrack.enabled = true; //if they are disabled then enable them and change color
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)';
    }
}

const toggleAudio = () => {
    //get video tracks of kind video
    let audioTrack = localStream.getTracks().find(track => track.kind === 'audio');
    if(audioTrack.enabled===true){ //if audio tracks are enabled then disable them and change color
        audioTrack.enabled = false;
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(255, 80, 80)';
    }else{
        audioTrack.enabled = true; //if they are disabled then enable them and change color
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)';
    }
}

window.addEventListener('beforeunload', leaveChannel); //when window of app closes, trigger this function

document.getElementById('camera-btn').addEventListener('click', toggleCamera); //add event listener to camera on click
document.getElementById('mic-btn').addEventListener('click', toggleAudio); //add event listener to audio on click

init(); //fire up the backend