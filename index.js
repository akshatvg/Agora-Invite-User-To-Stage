// create Agora client
var client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

// RTM Global Vars
var isLoggedIn = false;

var localTracks = {
    videoTrack: null,
    audioTrack: null
};

var localTrackState = {
    videoTrackEnabled: true,
    audioTrackEnabled: true
}

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
    $("#mic-btn").prop("disabled", false);
    $("#video-btn").prop("disabled", false);
    if (options.role === "audience") {
        $("#mic-btn").prop("disabled", true);
        $("#video-btn").prop("disabled", true);
        $("#raise-hand-div").append(`<button id="raise-hand" type="button" class="btn btn-live btn-sm" disabled>Raise Hand</button>`);
        // Event listeners
        client.on("user-published", handleUserPublished);
        client.on("user-joined", handleUserJoined);
        client.on("user-left", handleUserLeft);
    }
    // join the channel
    options.uid = await client.join(options.appid, options.channel, options.token || null);
    if (options.role === "host") {
        $('#mic-btn').prop('disabled', false);
        $('#video-btn').prop('disabled', false);
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
    if (options.role === "audience") {
        $("#raise-hand-div").empty();
    }
    for (trackName in localTracks) {
        var track = localTracks[trackName];
        if (track) {
            track.stop();
            track.close();
            $('#mic-btn').prop('disabled', true);
            $('#video-btn').prop('disabled', true);
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
            $(document).on('click', '#raise-hand', async function () {
                fullDivId = $(this).attr('id');
                if (handRaiseState === false) {
                    $("#raise-hand").text("Lower Hand");
                    handRaiseState = true;
                    console.log("Hand raised.");
                    // Inform channel that rand was raised
                    await channel.sendMessage({ text: "raised" }).then(() => {
                        console.log("Message sent successfully.");
                        console.log("Your message was: raised" + " sent by: " + accountName);
                    }).catch((err) => {
                        console.error("Message sending failed: " + err);
                    })
                }
                else if (handRaiseState === true) {
                    $("#raise-hand").text("Raise Hand");
                    handRaiseState = false;
                    console.log("Hand lowered.");
                    // Inform channel that rand was raised
                    await channel.sendMessage({ text: "lowered" }).then(() => {
                        console.log("Message sent successfully.");
                        console.log("Your message was: lowered" + " sent by: " + accountName);
                    }).catch((err) => {
                        console.error("Message sending failed: " + err);
                    })
                }
            });
            // Get channel message when someone raises hand
            channel.on('ChannelMessage', async function (text, peerId) {
                console.log(peerId + " changed their hand raise state to " + text.text);
                if (options.role === "host") {
                    if (text.text == "raised") {
                        // Ask host if user who raised their hand should be called onto stage or not
                        $('#confirm').modal('show');
                        $('#modal-body').text(peerId + " raised their hand. Do you want to make them a host?");
                        $('#promoteAccept').click(async function () {
                            // Call user onto stage
                            console.log("The host accepted " + peerId + "'s request.");
                            await clientRTM.sendMessageToPeer({
                                text: "host"
                            },
                                peerId,
                            ).then(sendResult => {
                                if (sendResult.hasPeerReceived) {
                                    console.log("Message has been received by: " + peerId + " Message: host");
                                } else {
                                    console.log("Message sent to: " + peerId + " Message: host");
                                }
                            }).catch(error => {
                                console.log("Error sending peer message: " + error);
                            });
                            $('#confirm').modal('hide');
                        });
                        $("#cancel").click(async function () {
                            // Inform the user that they were not made a host
                            console.log("The host rejected " + peerId + "'s request.");
                            await clientRTM.sendMessageToPeer({
                                text: "audience"
                            },
                                peerId,
                            ).then(sendResult => {
                                if (sendResult.hasPeerReceived) {
                                    console.log("Message has been received by: " + peerId + " Message: audience");
                                } else {
                                    console.log("Message sent to: " + peerId + " Message: audience");
                                }
                            }).catch((error) => {
                                console.log("Error sending peer message: " + error);
                            });
                            $('#confirm').modal('hide');
                        });
                    } else if (text.text == "lowered") {
                        $('#confirm').modal('hide');
                        console.log("Hand lowered so host can ignore this.");
                    }
                }
            })
            // Display messages from host when they approve the request
            clientRTM.on('MessageFromPeer', async function ({
                text
            }, peerId) {
                console.log(peerId + " changed your role to " + text);
                if (text === "host") {
                    await leave();
                    options.role = "host";
                    console.log("Role changed to host.");
                    await client.setClientRole("host");
                    await join();
                    $("#host-join").attr("disabled", true);
                    $("#audience-join").attr("disabled", true);
                    $("#raise-hand").attr("disabled", false);
                    $("#leave").attr("disabled", false);
                } else if (text === "audience" && options.role !== "audience") {
                    alert("The host rejected your proposal to be called onto stage.");
                    $("#raise-hand").attr("disabled", false);
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

// Mute audio click
$("#mic-btn").click(function (e) {
    if (localTrackState.audioTrackEnabled) {
        muteAudio();
    } else {
        unmuteAudio();
    }
});

// Mute video click
$("#video-btn").click(function (e) {
    if (localTrackState.videoTrackEnabled) {
        muteVideo();
    } else {
        unmuteVideo();
    }
})

// Hide mute buttons
function hideMuteButton() {
    $("#video-btn").css("display", "none");
    $("#mic-btn").css("display", "none");
}

// Show mute buttons
function showMuteButton() {
    $("#video-btn").css("display", "inline-block");
    $("#mic-btn").css("display", "inline-block");
}

// Mute audio function
async function muteAudio() {
    if (!localTracks.audioTrack) return;
    await localTracks.audioTrack.setEnabled(false);
    localTrackState.audioTrackEnabled = false;
    $("#mic-btn").text("Unmute Audio");
}

// Mute video function
async function muteVideo() {
    if (!localTracks.videoTrack) return;
    await localTracks.videoTrack.setEnabled(false);
    localTrackState.videoTrackEnabled = false;
    $("#video-btn").text("Unmute Video");
}

// Unmute audio function
async function unmuteAudio() {
    if (!localTracks.audioTrack) return;
    await localTracks.audioTrack.setEnabled(true);
    localTrackState.audioTrackEnabled = true;
    $("#mic-btn").text("Mute Audio");
}

// Unmute video function
async function unmuteVideo() {
    if (!localTracks.videoTrack) return;
    await localTracks.videoTrack.setEnabled(true);
    localTrackState.videoTrackEnabled = true;
    $("#video-btn").text("Mute Video");
}