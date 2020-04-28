const hyperswarm = require("hyperswarm");
const crypto = require("crypto");
const SHS = require("secret-handshake");
const cl = require("chloride");
const pull = require("pull-stream");
const { sink, source } = require("pull-stream-to-stream");

const appKey = crypto.randomBytes(32);

const aliceKey = cl.crypto_sign_keypair(); //client
const bobKey = cl.crypto_sign_keypair(); //server
const carolKey = cl.crypto_sign_keypair(); //server

const friendKeys = [aliceKey, carolKey];

function authorize(id, cb) {
  cb(null, true); //check wether id is authorized.
}

const ServerStream = SHS.createServer(aliceKey, authorize, appKey);
const ClientStream = SHS.createClient(bobKey, appKey);

const alice = hyperswarm();
const bob = hyperswarm();

// look for peers listed under this topic
const topic = crypto
  .createHash("sha256")
  .update("my-hyperswarm-topic")
  .digest();

alice.join(topic, {
  lookup: false,
  announce: true,
});

alice.on("connection", (socket, details) => {
  console.log("alice(connection): attempt");
  const shsStream = ServerStream(function (err, encryptedStream) {
    if (err) {
      console.log("alice(connection): fail");
      socket.end();
    } else {
      console.log("alice(connection): success");
      source(encryptedStream.source).pipe(process.stdout);
      pull(pull.values(["hey!"]), encryptedStream);
    }
  });

  source(shsStream.source).pipe(socket).pipe(sink(shsStream.sink));
});

bob.join(topic, {
  lookup: true,
  announce: false,
});

bob.on("connection", (socket, details) => {
  console.log(details);
  const randomFriend = Math.floor(Math.random() * friendKeys.length);
  console.log(randomFriend);
  const friendKey = friendKeys[randomFriend];
  console.log("bob(connection): attempt");
  const shsStream = ClientStream(friendKey.publicKey, function (
    err,
    encryptedStream
  ) {
    if (err) {
      console.log("bob(connection): fail");
      socket.end();
    } else {
      console.log("bob(connection): success");
      source(encryptedStream.source).pipe(process.stdout);
      pull(pull.values(["ahoy!"]), encryptedStream);
    }
  });

  source(shsStream.source).pipe(socket).pipe(sink(shsStream.sink));
});
