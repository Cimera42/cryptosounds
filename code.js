// Tim Porritt 2017

let audioContext;
let oscillator;
let gain;
let analyser;
let dataArray;

let exchangeWebsocket; 
let exchange;
let btcPrice;
let transactionType;
let product;

let bitfinexTradeChannelID;
let bitfinexTickerChannelID;

let canvas;
let ctx;

function init()
{
	audioContext = new AudioContext();
	oscillator = audioContext.createOscillator();
	oscillator.frequency.value = 200;
	oscillator.type = oscillator.SINE;

	gain = audioContext.createGain();
	gain.gain.value = 0.1;

	analyser = audioContext.createAnalyser();
	analyser.fftSize = 4096;
	let bufferLength = analyser.frequencyBinCount;
	dataArray = new Uint8Array(bufferLength);
	analyser.getByteTimeDomainData(dataArray);

	oscillator.connect(analyser);
	analyser.connect(gain);
	gain.connect(audioContext.destination);

	exchange = document.getElementById("exchangeChoice").value;
	changeExchange();
	initWebsocket();

	canvas = document.getElementById("canvas");
	ctx = canvas.getContext("2d");
	draw();

	oscillator.start();
}

function initWebsocket()
{
	if(exchangeWebsocket)
		exchangeWebsocket.close();

	if(exchange === "GDAX")
		exchangeWebsocket = new WebSocket("wss://ws-feed.gdax.com");
	else if(exchange === "Bitfinex")
		exchangeWebsocket = new WebSocket("wss://api.bitfinex.com/ws/2");

	exchangeWebsocket.onopen = gdaxOpen;
	exchangeWebsocket.onclose = gdaxClose;
	exchangeWebsocket.onerror = gdaxError;

	if(exchange === "GDAX")
		exchangeWebsocket.onmessage = gdaxMessage;
	else if(exchange === "Bitfinex")
		exchangeWebsocket.onmessage = bitfinexMessage;

	transactionType = document.getElementById("transactionType").value;
	if(exchange === "GDAX")
		product = document.getElementById("gdaxCurrencyPair").value;
	else if(exchange === "Bitfinex")
		product = "t" + document.getElementById("bitfinexCurrencyOne").value + "" + document.getElementById("bitfinexCurrencyTwo").value;
}

function gdaxOpen(e)
{
	console.log(e);
	if(exchange === "GDAX")
		gdaxSubscribe([product]);
	else if(exchange === "Bitfinex")
		bitfinexSubscribe(product);
}

function gdaxSubscribe(products)
{
	exchangeWebsocket.send(JSON.stringify({
		"type": "subscribe",
		"product_ids": products,
		"channels": [
			"level2",
			"ticker",
		]
	}));
}

function bitfinexSubscribe(products)
{
	console.log(products);
	exchangeWebsocket.send(JSON.stringify({
		event: "subscribe",
		channel: "trades",
		symbol: products
	}));
	exchangeWebsocket.send(JSON.stringify({
		event: "subscribe",
		channel: "ticker",
		symbol: products
	}));
}

function bitfinexUnsubscribe(product)
{
	if(bitfinexTradeChannelID)
	{
		exchangeWebsocket.send(JSON.stringify({
			event: "unsubscribe",
			chanId: bitfinexTradeChannelID
		}));
		bitfinexTradeChannelID = undefined;
	}
	if(bitfinexTickerChannelID)
	{
		exchangeWebsocket.send(JSON.stringify({
			event: "unsubscribe",
			chanId: bitfinexTickerChannelID
		}));
		bitfinexTickerChannelID = undefined;
	}
}

function gdaxUnsubscribe(products)
{
	exchangeWebsocket.send(JSON.stringify({
		"type": "unsubscribe",
		"product_ids": products,
		"channels": [
			"level2",
			"ticker",
		]
	}));
}

function gdaxClose(e)
{
	console.log(e);

	exchangeWebsocket = undefined;
	initWebsocket();
}

function gdaxError(e)
{
	console.log(e);
}

function gdaxMessage(e)
{
	// console.log(e);

	let data = JSON.parse(e.data);
	if(data.type === "ticker")
	{
		btcPrice = data.price;
	}
	else if(data.type === "l2update")
	{
		if(btcPrice)
		{
			if(data.changes)
			{
				if(transactionType === "both" || data.changes[0][0] === transactionType)
				{
					oscillator.frequency.linearRampToValueAtTime(
						data.changes[0][1] - btcPrice + 300,
						audioContext.currentTime + 0.001
					);
				}
			}
		}
	}
	else
	{
		console.log(data);
	}
}

function bitfinexMessage(e)
{
	let data = JSON.parse(e.data);
	if(data.event === "subscribed")
	{
		document.getElementById("failedPairMessage").style.display = "none";
		console.log(data);

		if(data.channel === "trades")
			bitfinexTradeChannelID = data.chanId;
		else if(data.channel === "ticker")
			bitfinexTickerChannelID = data.chanId;
	}
	else if(bitfinexTickerChannelID && bitfinexTickerChannelID)
	{
		if(data[1] !== "hb")
		{
			if(data[0] === bitfinexTickerChannelID)
			{
				btcPrice = data[1][0];
			}
			else if(data[0] ===  bitfinexTradeChannelID)
			{
				if(btcPrice && data[1] === "tu")
				{
					if(transactionType === "both" 
						|| (data[2][2] < 0 && transactionType === "sell")
						|| (data[2][2] > 0 && transactionType === "buy"))
					{
						oscillator.frequency.linearRampToValueAtTime(
							data[2][3] - btcPrice + 300,
							audioContext.currentTime + 0.001
						);
					}
				}
			}
		}
	}
	else if(data.event === "error")
	{
		console.log(data);

		if(data.msg === "symbol: invalid")
		{
			document.getElementById("failedPairMessage").style.display = "block";
		}
	}
	else
	{
		console.log(data);
	}
}

function draw()
{
	analyser.getByteFrequencyData(dataArray);

	ctx.fillStyle = "rgb(161,230,156)";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = "black";
	let barWidth = canvas.width / dataArray.length * 2.5;
	let x = 0;
	for(let i = 0; i < dataArray.length; i++)
	{
		let y = canvas.height - dataArray[i];

		ctx.fillRect(x, y, barWidth, dataArray[i]);

		x += barWidth;
	}

	requestAnimationFrame(draw);
}

function transactionTypeChanged(e)
{
	transactionType = e.target.value;
}

function currencyPairChanged(e)
{
	if(exchange === "GDAX")
	{
		gdaxUnsubscribe([product]);
		product = e.target.value;
		gdaxSubscribe([product]);
	}
	else if(exchange === "Bitfinex")
	{
		bitfinexUnsubscribe();
		product = "t" + document.getElementById("bitfinexCurrencyOne").value + "" + document.getElementById("bitfinexCurrencyTwo").value;
		bitfinexSubscribe(product);
	}
}

function exchangeChoiceChanged(e)
{
	exchange = e.target.value;

	changeExchange();

	initWebsocket();
}

function changeExchange()
{
	if(exchange === "GDAX")
	{
		document.getElementById("gdaxCurrencyPairDiv").style.display = "block";
		document.getElementById("bitfinexCurrencyPairDiv").style.display = "none";
	}
	else if(exchange === "Bitfinex")
	{
		document.getElementById("gdaxCurrencyPairDiv").style.display = "none";
		document.getElementById("bitfinexCurrencyPairDiv").style.display = "block";
	}
}