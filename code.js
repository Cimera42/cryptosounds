// Tim Porritt 2017

let audioContext;
let oscillator;
let gain;
let stereoPanner;
let analyser;
let dataArray;
let multiplier;

let exchangeWebsocket;
let exchange;
let currencyPrice;
let transactionType;
let product;

let bitfinexTradeChannelID;
let bitfinexTickerChannelID;
let poloniexChannelID;
let poloniexOrderType;

let canvas;
let ctx;
let currentCol;
let targetCol;
let lastTime;
let doPsychadelic;

function init()
{
	audioContext = new AudioContext();
	oscillator = audioContext.createOscillator();
	oscillator.frequency.value = 200;
	oscillator.type = oscillator.SINE;

	gain = audioContext.createGain();
	gain.gain.value = document.getElementById("volume").value;
	document.getElementById("volumeOutput").value = parseFloat(document.getElementById("volume").value).toFixed(2);
	
	setMultiplier(document.getElementById("multiplier").value);

	stereoPanner = audioContext.createStereoPanner();

	analyser = audioContext.createAnalyser();
	analyser.fftSize = 4096;
	let bufferLength = analyser.frequencyBinCount;
	dataArray = new Uint8Array(bufferLength);
	analyser.getByteTimeDomainData(dataArray);

	oscillator.connect(analyser);
	oscillator.connect(gain);
	gain.connect(audioContext.destination);

	exchange = document.getElementById("exchangeChoice").value;
	changeExchange();
	initWebsocket();

	canvas = document.getElementById("canvas");
	ctx = canvas.getContext("2d");
	currentCol = 0;
	targetCol = 0;
	lastTime = Date.now();
	doPsychadelic = document.getElementById("psychadelic").checked;
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
	else if(exchange === "OKEX")
		exchangeWebsocket = new WebSocket("wss://real.okex.com:10441/websocket");
	else if(exchange === "Poloniex")
		exchangeWebsocket = new WebSocket("wss://api2.poloniex.com");

	exchangeWebsocket.onopen = websocketOpen;
	exchangeWebsocket.onclose = websocketClose;
	exchangeWebsocket.onerror = websocketError;

	if(exchange === "GDAX")
		exchangeWebsocket.onmessage = gdaxMessage;
	else if(exchange === "Bitfinex")
		exchangeWebsocket.onmessage = bitfinexMessage;
	else if(exchange === "OKEX")
		exchangeWebsocket.onmessage = okexMessage;
	else if(exchange === "Poloniex")
		exchangeWebsocket.onmessage = poloniexMessage;

	transactionType = document.getElementById("transactionType").value;
	if(exchange === "GDAX")
		product = document.getElementById("gdaxCurrencyPair").value;
	else if(exchange === "Bitfinex")
		product = "t" + document.getElementById("bitfinexCurrencyOne").value + "" + document.getElementById("bitfinexCurrencyTwo").value;
	else if(exchange === "OKEX")
		product = document.getElementById("okexCurrencyPair").value;
	else if(exchange === "Poloniex")
	{
		let primary = document.getElementById("poloniexCurrencyPrimary").value;
		product = primary + "_" + document.getElementById("poloniexCurrency" + primary).value;
		poloniexOrderType = document.getElementById("orderType").value;
	}
}

function websocketOpen(e)
{
	console.log(e);
	if(exchange === "GDAX")
		gdaxSubscribe([product]);
	else if(exchange === "Bitfinex")
		bitfinexSubscribe(product);
	else if(exchange === "OKEX")
		okexSubscribe(product);
	else if(exchange === "Poloniex")
		poloniexSubscribe(product);
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

function okexSubscribe(products)
{
	exchangeWebsocket.send(JSON.stringify({
		event: "addChannel",
		channel: "ok_sub_spot_" + products + "_ticker"
	}));
	exchangeWebsocket.send(JSON.stringify({
		event: "addChannel",
		channel: "ok_sub_spot_" + products + "_deals"
	}));
}

function okexUnsubscribe(products)
{
	exchangeWebsocket.send(JSON.stringify({
		event: "removeChannel",
		channel: "ok_sub_spot_" + products + "_ticker"
	}));
	exchangeWebsocket.send(JSON.stringify({
		event: "removeChannel",
		channel: "ok_sub_spot_" + products + "_deals"
	}));
}

function poloniexSubscribe(product)
{
	exchangeWebsocket.send(JSON.stringify({
		command: "subscribe",
		channel: 1002 //ticker
	}));
	exchangeWebsocket.send(JSON.stringify({
		command: "subscribe",
		channel: product
	}));
}

function poloniexUnsubscribe(product)
{
	exchangeWebsocket.send(JSON.stringify({
		command: "unsubscribe",
		channel: 1002 //ticker
	}));
	exchangeWebsocket.send(JSON.stringify({
		command: "unsubscribe",
		channel: product
	}));
}

function websocketClose(e)
{
	console.log(e);

	exchangeWebsocket = undefined;
	autobahnWebsocket = undefined;
	initWebsocket();
}

function websocketError(e)
{
	console.log(e);
}

function setFrequency(price)
{
	if(currencyPrice)
	{
		oscillator.frequency.linearRampToValueAtTime(
			(price - currencyPrice)*multiplier + 300,
			audioContext.currentTime + 0.001
		);
		targetCol = (price - currencyPrice)*multiplier;
	}
	else
		console.log("Currency Price not set");
}

function gdaxMessage(e)
{
	// console.log(e);

	let data = JSON.parse(e.data);
	if(data.type === "ticker")
	{
		currencyPrice = data.price;
	}
	else if(data.type === "l2update")
	{
		if(currencyPrice)
		{
			if(data.changes)
			{
				if(transactionType === "both" || data.changes[0][0] === transactionType)
				{
					setFrequency(data.changes[0][1]);
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
				currencyPrice = data[1][0];
			}
			else if(data[0] ===  bitfinexTradeChannelID)
			{
				if(currencyPrice && data[1] === "tu")
				{
					if(transactionType === "both" 
						|| (data[2][2] < 0 && transactionType === "sell")
						|| (data[2][2] > 0 && transactionType === "buy"))
					{
						setFrequency(data[2][3]);
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

function okexMessage(e)
{
	let data = JSON.parse(e.data);
	if(data[0].channel)
	{
		if(data[0].channel.includes("ticker"))
		{
			currencyPrice = data[0].data.buy;
		}
		else if(data[0].channel.includes("deals"))
		{
			if(transactionType === "both" 
				|| (data[0].data[0][4] === "ask" && transactionType === "sell")
				|| (data[0].data[0][4] === "bid" && transactionType === "buy"))
			{
				setFrequency(data[0].data[0][1]);
			}
		}
		else
		{
			console.log(data);
		}
	}
	else
	{
		console.log(data);
	}
}

function poloniexMessage(e)
{
	let data = JSON.parse(e.data);
	if(data[0] === 1002)
	{
		if(poloniexChannelID && data[2] && data[2][0] === poloniexChannelID)
		{
			currencyPrice = data[2][1];
		}
	}
	else if(data[2] && data[2][0][0] === "i")
	{
		console.log(data);
		poloniexChannelID = data[0];
	}
	else
	{
		if(data[0] === poloniexChannelID)
		{
			for(index in data[2])
			{
				let trans = data[2][index];
				//console.log(data);
				if(trans[0] === "o" && (poloniexOrderType === "orderbook" || poloniexOrderType === "both")) //actual trade ("o" = orderbook)
				{
					if(transactionType === "both" 
						|| (trans[1] === 0 && transactionType === "sell")
						|| (trans[1] === 1 && transactionType === "buy"))
					{ 
						setFrequency(trans[2]);
						break;
					}
				}
				else if(trans[0] === "t" && (poloniexOrderType === "trade" || poloniexOrderType === "both")) //actual trade ("o" = orderbook)
				{
					if(transactionType === "both" 
						|| (trans[2] === 0 && transactionType === "sell")
						|| (trans[2] === 1 && transactionType === "buy"))
					{
						setFrequency(trans[3]);
						break;
					}
				}
			}
		}
		else
		{
			console.log(e);
		}
	}
}

function volumeChange(e)
{
	if(gain)
	{
		gain.gain.linearRampToValueAtTime(e.target.value, audioContext.currentTime + 0.001);
		document.getElementById("volumeOutput").value = parseFloat(e.target.value).toFixed(2);
	}
}

function setMultiplier(val)
{
	if(val < 0)
		multiplier = 1 + parseFloat(val);
	else if(val > 0)
	{
		if(val <= 3)
		{
			multiplier = val*100;
		}
		else
		{
			multiplier = 300 + Math.exp(Math.log(499700) * (val-3));
		}
	}
	else
		multiplier = 1;

	document.getElementById("multiplierOutput").value = parseFloat(multiplier).toFixed(2);
}

function multiplierChange(e)
{
	setMultiplier(e.target.value);
}

function resetMultiplier(e)
{
	setMultiplier(0);
	document.getElementById("multiplier").value = 0;
}

function draw()
{
	analyser.getByteFrequencyData(dataArray);

	if(doPsychadelic)
	{
		let now = Date.now();
		let dt = (now - lastTime)/1000;
		lastTime = now;
		currentCol += (0-targetCol)*(dt*0.25);
		ctx.fillStyle = "hsl(" + (120+currentCol) + ",100%,80%)";
	}
	else
		ctx.fillStyle = "rgb(161,230,156)";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	if(doPsychadelic)
	{
		//Opposite of background
		ctx.fillStyle = "hsl(" + (180+120+currentCol) + ",100%,80%)";
	}
	else
		ctx.fillStyle = "black";
	let barWidth = canvas.width / dataArray.length * 2.5;
	let x = 0;
	for(let i = 0; i < dataArray.length; i++)
	{
		let y = canvas.height - dataArray[i];

		//±1 pixel to prevent lines between bars
		ctx.fillRect(x-1, y, barWidth+1, dataArray[i]);

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
	else if(exchange === "OKEX")
	{
		okexUnsubscribe(product);
		product = e.target.value;
		okexSubscribe(product);
	}
	else if(exchange === "Poloniex")
	{
		poloniexChoiceShow();
		poloniexUnsubscribe(product);
		let primary = document.getElementById("poloniexCurrencyPrimary").value;
		product = primary + "_" + document.getElementById("poloniexCurrency" + primary).value;
		poloniexSubscribe(product);
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
		document.getElementById("okexCurrencyPairDiv").style.display = "none";
		document.getElementById("poloniexCurrencyPairDiv").style.display = "none";
	}
	else if(exchange === "Bitfinex")
	{
		document.getElementById("gdaxCurrencyPairDiv").style.display = "none";
		document.getElementById("bitfinexCurrencyPairDiv").style.display = "block";
		document.getElementById("okexCurrencyPairDiv").style.display = "none";
		document.getElementById("poloniexCurrencyPairDiv").style.display = "none";
	}
	else if(exchange === "OKEX")
	{
		document.getElementById("gdaxCurrencyPairDiv").style.display = "none";
		document.getElementById("bitfinexCurrencyPairDiv").style.display = "none";
		document.getElementById("okexCurrencyPairDiv").style.display = "block";
		document.getElementById("poloniexCurrencyPairDiv").style.display = "none";
	}
	else if(exchange === "Poloniex")
	{
		document.getElementById("gdaxCurrencyPairDiv").style.display = "none";
		document.getElementById("bitfinexCurrencyPairDiv").style.display = "none";
		document.getElementById("okexCurrencyPairDiv").style.display = "none";
		document.getElementById("poloniexCurrencyPairDiv").style.display = "block";
		poloniexChoiceShow();
	}
}

function psychadelicChange(e)
{
	doPsychadelic = e.target.checked;
}

function orderTypeChanged(e)
{
	poloniexOrderType = e.target.value;
}

function poloniexChoiceShow()
{
	document.querySelectorAll("select[name='poloniexCurrencySecondary']").forEach(
		v => v.style.display = "none"
	);
	document.getElementById("poloniexCurrencyBTC");

	let primary = document.getElementById("poloniexCurrencyPrimary").value;
	document.getElementById("poloniexCurrency" + primary).style.display = "inline-block";
}