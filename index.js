const hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const SHS = require('secret-handshake')
const cl = require('chloride')
const pull = require('pull-stream')
const { sink, source } = require('pull-stream-to-stream')

const appKey = crypto.randomBytes(32);

const aliceKey = cl.crypto_sign_keypair() //client
const bobKey = cl.crypto_sign_keypair()   //server
const carolKey = cl.crypto_sign_keypair()   //server

const friendKeys = [aliceKey, carolKey]

function authorize(id, cb) {
	cb(null, true) //check wether id is authorized.
}

const ServerStream = SHS.createServer(aliceKey, authorize, appKey)
const ClientStream = SHS.createClient(bobKey, appKey)

const alice = hyperswarm()
const bob = hyperswarm()

// look for peers listed under this topic
const topic = crypto.createHash('sha256')
	.update('my-hyperswarm-topic')
	.digest()

alice.join(topic, {
	lookup: false,
	announce: true,
})

alice.on('connection', (socket, details) => {
	let attemptsLeft = 16;

	const tryConnection = () => {
		console.log('alice(connection): attempt')
		const shsStream = ServerStream(function (err, encryptedStream) {
			attemptsLeft -= 1;
			if (err) {
				console.log('alice(connection): fail')
				if (attemptsLeft) {
					console.log('alice(connection): allow retry')
					setTimeout(tryConnection, 1000)
				} else {
					console.log('alice(connection): abort')
				}
			} else {
				console.log('alice(connection): success')
			}
		})

		source(shsStream.source).pipe(socket).pipe(sink(shsStream.sink));
	}
	tryConnection()
})

bob.join(topic, {
	lookup: true,
	announce: false
})

bob.on('connection', (socket, details) => {
	let friends = Array.from(friendKeys);

	const tryConnection = () => {
		const friendKey = friends.pop();

		console.log('bob(connection): attempt')
		const shsStream = ClientStream(friendKey.publicKey, function (err, encryptedStream) {
			if (err) {
				console.log('bob(connection): fail')
				if (friends.length) {
					console.log('bob(connection): retry')
					setTimeout(tryConnection, 1000)
				} else {
					console.log('bob(connection): abort')
				}
			} else {
				console.log('bob(connection): success')
			}
		})

		source(shsStream.source).pipe(socket).pipe(sink(shsStream.sink));
	}

	tryConnection()

})
