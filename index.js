// create Agora client
var client = AgoraRTC.createClient({
    mode: "live",
    codec: "vp8"
});

// RTM Global Vars
var isLoggedIn = false;

var localTracks = {
    videoTrack: null,
    audioTrack: null
};
var remoteUsers = {};
// Agora client options
var options = {
    appid: $("#appid").val(),
    channel: null,
    uid: null,
    token: null,
    accountName: null,
    role: "audience"
};

// Host join
$("#host-join").click(function (e) {
    RTMJoin();
    options.role = "host";
})

// Audience join
$("#audience-join").click(function (e) {
    RTMJoin();
    options.role = "audience";
})

// Join form submission
$("#join-form").submit(async function (e) {
    e.preventDefault();
    $("#host-join").attr("disabled", true);
    $("#audience-join").attr("disabled", true);
    try {
        options.appid = $("#appid").val();
        options.token = $("#token").val();
        options.channel = $("#channel").val();
        options.accountName = $('#accountName').val();
        await join();
    } catch (error) {
        console.error(error);
    } finally {
        $("#raise-hand").attr("disabled", false);
        $("#leave").attr("disabled", false);
    }
})

// Leave click
$("#leave").click(function (e) {
    leave();
})

async function join() {
    // create Agora client
    client.setClientRole(options.role);
    if (options.role === "audience") {
        // add event listener to play remote tracks when remote user publishs.
        client.on("user-published", handleUserPublished);
        client.on("user-unpublished", handleUserUnpublished);
    }
    // join the channel
    options.uid = await client.join(options.appid, options.channel, options.token || null);
    if (options.role === "host") {
        // create local audio and video tracks
        localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
        // play local video track
        localTracks.videoTrack.play("local-player");
        $("#local-player-name").text(`localTrack(${options.uid})`);
        // publish local tracks to channel
        await client.publish(Object.values(localTracks));
        console.log("Successfully published.");
    }
}

// Leave
async function leave() {
    for (trackName in localTracks) {
        var track = localTracks[trackName];
        if (track) {
            track.stop();
            track.close();
            localTracks[trackName] = undefined;
        }
    }
    // remove remote users and player views
    remoteUsers = {};
    $("#remote-playerlist").html("");
    // leave the channel
    await client.leave();
    $("#local-player-name").text("");
    $("#host-join").attr("disabled", false);
    $("#audience-join").attr("disabled", false);
    $("#leave").attr("disabled", true);
    $("#raise-hand").attr("disabled", true);
    console.log("Client successfully left channel.");
}

async function RTMJoin() {
    // Create Agora RTM client
    const clientRTM = AgoraRTM.createInstance($("#appid").val(), {
        enableLogUpload: false
    });
    var accountName = $('#accountName').val();
    // Login
    clientRTM.login({
        uid: accountName
    }).then(() => {
        console.log('AgoraRTM client login success. Username: ' + accountName);
        isLoggedIn = true;
        // RTM Channel Join
        var channelName = $('#channel').val();
        channel = clientRTM.createChannel(channelName);
        channel.join().then(() => {
            console.log('AgoraRTM client channel join success.');
            // Get all members in RTM Channel
            channel.getMembers().then((memberNames) => {
                console.log("------------------------------");
                console.log("All members in the channel are as follows: ");
                console.log(memberNames);
                var newHTML = $.map(memberNames, function (singleMember) {
                    if (singleMember != accountName) {
                        return (`<li class="mt-2">
                  <div class="row">
                      <p>${singleMember}</p>
                   </div>
                   <div class="mb-4">
                     <button class="text-white btn btn-live mx-3 remoteHost hostOn" id="remoteAudio-${singleMember}">Make Host</button>
                     <button class="text-white btn btn-live remoteAudience audienceOn" id="remoteVideo-${singleMember}">Make Audience</button>
                    </div>
                 </li>`);
                    }
                });
                $("#insert-all-users").html(newHTML.join(""));
            });
            // Send peer-to-peer message for changing role to host
            $(document).on('click', '.remoteHost', function () {
                fullDivId = $(this).attr('id');
                peerId = fullDivId.substring(fullDivId.indexOf("-") + 1);
                console.log("Remote host button pressed.");
                let peerMessage = "host";
                clientRTM.sendMessageToPeer({
                        text: peerMessage
                    },
                    peerId,
                ).then(sendResult => {
                    if (sendResult.hasPeerReceived) {
                        console.log("Message has been received by: " + peerId + " Message: " + peerMessage);
                    } else {
                        console.log("Message sent to: " + peerId + " Message: " + peerMessage);
                    }
                })
            });
            // Send peer-to-peer message for changing role to audience
            $(document).on('click', '.remoteAudience', function () {
                fullDivId = $(this).attr('id');
                peerId = fullDivId.substring(fullDivId.indexOf("-") + 1);
                console.log("Remote audience button pressed.");
                let peerMessage = "audience";
                clientRTM.sendMessageToPeer({
                        text: peerMessage
                    },
                    peerId,
                ).then(sendResult => {
                    if (sendResult.hasPeerReceived) {
                        console.log("Message has been received by: " + peerId + " Message: " + peerMessage);
                    } else {
                        console.log("Message sent to: " + peerId + " Message: " + peerMessage);
                    }
                })
            });
            // Display messages from peer
            clientRTM.on('MessageFromPeer', function ({
                text
            }, peerId) {
                console.log(peerId + " changed your role to " + text);
                if (text == "host") {
                    leave();
                    options.role = "host";
                    console.log("Role changed to host.");
                    client.setClientRole("host");
                    join();
                    $("#host-join").attr("disabled", true);
                    $("#audience-join").attr("disabled", true);
                } else if (text == "audience") {
                    leave();
                    options.role = "audience";
                    console.log("Role changed to audience.");
                    client.setClientRole("audience");
                    join();
                    $("#host-join").attr("disabled", true);
                    $("#audience-join").attr("disabled", true);
                }
            })
            // Display channel member joined updated users
            channel.on('MemberJoined', function () {
                // Get all members in RTM Channel
                channel.getMembers().then((memberNames) => {
                    console.log("New member joined so updated list is: ");
                    console.log(memberNames);
                    var newHTML = $.map(memberNames, function (singleMember) {
                        if (singleMember != accountName) {
                            return (`<li class="mt-2">
                      <div class="row">
                          <p>${singleMember}</p>
                       </div>
                       <div class="mb-4">
                         <button class="text-white btn btn-live mx-3 remoteHost hostOn" id="remoteAudio-${singleMember}">Make Host</button>
                         <button class="text-white btn btn-live remoteAudience audienceOn" id="remoteVideo-${singleMember}">Make Audience</button>
                        </div>
                     </li>`);
                        }
                    });
                    $("#insert-all-users").html(newHTML.join(""));
                });
            })
            // Display channel member left updated users
            channel.on('MemberLeft', function () {
                // Get all members in RTM Channel
                channel.getMembers().then((memberNames) => {
                    console.log("A member left so updated list is: ");
                    console.log(memberNames);
                    var newHTML = $.map(memberNames, function (singleMember) {
                        if (singleMember != accountName) {
                            return (`<li class="mt-2">
                      <div class="row">
                          <p>${singleMember}</p>
                       </div>
                       <div class="mb-4">
                         <button class="text-white btn btn-live mx-3 remoteHost hostOn" id="remoteAudio-${singleMember}">Make Host</button>
                         <button class="text-white btn btn-live remoteAudience audienceOn" id="remoteVideo-${singleMember}">Make Audience</button>
                        </div>
                     </li>`);
                        }
                    });
                    $("#insert-all-users").html(newHTML.join(""));
                });
            });
        }).catch(error => {
            console.log('AgoraRTM client channel join failed: ', error);
        }).catch(err => {
            console.log('AgoraRTM client login failure: ', err);
        });
    });
    // Logout
    document.getElementById("leave").onclick = async function () {
        console.log("Client logged out of RTM.");
        await clientRTM.logout();
    }
}

// Subscribe to a remote user
async function subscribe(user, mediaType) {
    const uid = user.uid;
    await client.subscribe(user, mediaType);
    console.log("Successfully subscribed.");
    if (mediaType === 'video') {
        const player = $(`
      <div id="player-wrapper-${uid}">
        <p class="player-name">remoteUser(${uid})</p>
        <div id="player-${uid}" class="player"></div>
      </div>
    `);
        $("#remote-playerlist").append(player);
        user.videoTrack.play(`player-${uid}`);
    }
    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
}

// Handle user publish
function handleUserPublished(user, mediaType) {
    const id = user.uid;
    remoteUsers[id] = user;
    subscribe(user, mediaType);
}

// Handle user unpublish
function handleUserUnpublished(user) {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();
}