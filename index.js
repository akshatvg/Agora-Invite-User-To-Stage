// create Agora client
var client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

// RTM Global Vars
var isLoggedIn = false;

var localTracks = {
    videoTrack: null,
    audioTrack: null
};

// Hand raise state
var handRaiseState = false;


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

async function join() { // create Agora client
    client.setClientRole(options.role);
    if (options.role === "audience") { // add event listener to play remote tracks when remote user publishs.
        $("#raise-hand-div").append(`<button id="raise-hand" type="button" class="btn btn-live btn-sm" disabled>Raise Hand</button>`);
        client.on("user-published", handleUserPublished);
        client.on("user-joined", handleUserJoined);
        client.on("user-left", handleUserLeft);
    }
    // join the channel
    options.uid = await client.join(options.appid, options.channel, options.token || null);
    if (options.role === "host") {
        client.on("user-published", handleUserPublished);
        client.on("user-joined", handleUserJoined);
        client.on("user-left", handleUserLeft);
        // create local audio and video tracks
        localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
        // play local video track
        localTracks.videoTrack.play("local-player");
        $("#local-player-name").text(`localTrack(${options.uid
            })`);
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

async function RTMJoin() { // Create Agora RTM client
    const clientRTM = AgoraRTM.createInstance($("#appid").val(), { enableLogUpload: false });
    var accountName = $('#accountName').val();
    // Login
    clientRTM.login({ uid: accountName }).then(() => {
        console.log('AgoraRTM client login success. Username: ' + accountName);
        isLoggedIn = true;
        // RTM Channel Join
        var channelName = $('#channel').val();
        channel = clientRTM.createChannel(channelName);
        channel.join().then(() => {
            console.log('AgoraRTM client channel join success.');
            // Send channel message for raising hand
            $(document).on('click', '#raise-hand', function () {
                fullDivId = $(this).attr('id');
                if (handRaiseState === false) {
                    $("#raise-hand").text("Lower Hand");
                    handRaiseState = true;
                    console.log("Hand raised.");
                    // Inform channel that rand was raised
                    channel.sendMessage({ text: handRaiseState.toString() }).then(() => {
                        console.log("Message sent successfully.");
                        console.log("Your message was: " + handRaiseState + " sent by: " + accountName);
                    }).catch((err) => {
                        console.error("Message sending failed: " + err);
                    })
                }
                else if (handRaiseState === true) {
                    $("#raise-hand").text("Raise Hand");
                    handRaiseState = false;
                    console.log("Hand lowered.");
                    // Inform channel that rand was raised
                    channel.sendMessage({ text: handRaiseState.toString() }).then(() => {
                        console.log("Message sent successfully.");
                        console.log("Your message was: " + handRaiseState + " sent by: " + accountName);
                    }).catch((err) => {
                        console.error("Message sending failed: " + err);
                    })
                }
            });
            // Get channel message when someone raises hand
            channel.on('ChannelMessage', function (text, peerId) {
                console.log(peerId + " changed their hand raise state to " + text.text);
                if (text.text == "true") {
                    // Ask host if user who raised their hand should be called onto stage or not
                    var r = confirm(peerId + " raised their hand. Do you want to make them a host?");
                    if (r == true) {
                        // Call user onto stage
                        console.log("The host accepted " + peerId + "'s request.");
                        clientRTM.sendMessageToPeer({
                            text: "host"
                        },
                            peerId,
                        ).then(sendResult => {
                            if (sendResult.hasPeerReceived) {
                                console.log("Message has been received by: " + peerId + " Message: " + peerMessage);
                            } else {
                                console.log("Message sent to: " + peerId + " Message: " + peerMessage);
                            }
                        });
                    } else {
                        // Inform the user that they were not made a host
                        console.log("The host rejected " + peerId + "'s request.");
                        clientRTM.sendMessageToPeer({
                            text: "audience"
                        },
                            peerId,
                        ).then(sendResult => {
                            if (sendResult.hasPeerReceived) {
                                console.log("Message has been received by: " + peerId + " Message: " + peerMessage);
                            } else {
                                console.log("Message sent to: " + peerId + " Message: " + peerMessage);
                            }
                        });
                    }
                } else if (text.text == "false") {
                    console.log("Hand lowered so host can ignore this.");
                }
            })
            // Display messages from host when they approve the request
            clientRTM.on('MessageFromPeer', async function ({
                text
            }, peerId) {
                console.log(peerId + " changed your role to " + text);
                if (text == "host") {
                    await leave();
                    options.role = "host";
                    console.log("Role changed to host.");
                    await client.setClientRole("host");
                    await join();
                    $("#host-join").attr("disabled", true);
                    $("#audience-join").attr("disabled", true);
                    $("#leave").attr("disabled", false);
                    $("#raise-hand").remove();
                } else if (text == "audience") {
                    alert("The host rejected your proposal to be called onto stage.");
                }
            })
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

// Handle user published
function handleUserPublished(user, mediaType) {
    const id = user.uid;
    remoteUsers[id] = user;
    subscribe(user, mediaType);
}

// Handle user joined
function handleUserJoined(user, mediaType) {
    const id = user.uid;
    remoteUsers[id] = user;
    subscribe(user, mediaType);
}

// Handle user left
function handleUserLeft(user) {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();
}
