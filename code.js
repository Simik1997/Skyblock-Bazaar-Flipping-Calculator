// Static defines
var DOMAIN = "https://api.hypixel.net";
var MAX_QUANTITY_PER_ORDER = 71680;
var ITEM_NAMES_LOOKUP = new Map();

// Global data storage
var apiData = {};

// Default values
var maxOutlay = 1000000;
var maxOffers = 1;
var maxBacklog = 7;
var taxRate = 1.25;
var sortByName = false;
var sortBySalesBacklog = false;
var sortByBuyOrder = false;
var sortBySellOffer = false;
var sortByProfitPerItem = false;
var sortByQuantity = false;
var sortByNumOffers = false;
var sortByTotalProfit = true;
var hiddenItems = [''];
var favorites = [''];
var transactions = []; //{id: uuidv4(),date: new Date(),type: "buy", name: "Enchanted Pork", price: 1000.3, count:2000, countProgressed: 1000},{id: uuidv4(),date: new Date(),type: "sell", name: "Enchanted Pork", price: 1024.1, count:2000, countProgressed: 1000}
var calcData = [];
var allData = [];

var expertMode = false;
var transactionLog = false;
var npcDeals = false;

// Item name lookups for certain items where just transforming the name
// to sentence case isn't enough
ITEM_NAMES_LOOKUP.set('ENCHANTED_CARROT_STICK', 'Enchanted Carrot on a Stick');
ITEM_NAMES_LOOKUP.set('HUGE_MUSHROOM_1', 'Brown Mushroom Block');
ITEM_NAMES_LOOKUP.set('HUGE_MUSHROOM_2', 'Red Mushroom Block');
ITEM_NAMES_LOOKUP.set('ENCHANTED_HUGE_MUSHROOM_1', 'Enchanted Brown Mushroom Block');
ITEM_NAMES_LOOKUP.set('ENCHANTED_HUGE_MUSHROOM_2', 'Enchanted Red Mushroom Block');
ITEM_NAMES_LOOKUP.set('SULPHUR', 'Gunpowder');
ITEM_NAMES_LOOKUP.set('RABBIT', 'Raw Rabbit');
ITEM_NAMES_LOOKUP.set('ENCHANTED_RABBIT', 'Enchanted Raw Rabbit');
ITEM_NAMES_LOOKUP.set('RAW_FISH:1', 'Raw Salmon');
ITEM_NAMES_LOOKUP.set('RAW_FISH:2', 'Clownfish');
ITEM_NAMES_LOOKUP.set('RAW_FISH:3', 'Pufferfish');
ITEM_NAMES_LOOKUP.set('INK_SACK:3', 'Cocoa Beans');
ITEM_NAMES_LOOKUP.set('INK_SACK:4', 'Lapis Lazuli');
ITEM_NAMES_LOOKUP.set('LOG', 'Oak Log');
ITEM_NAMES_LOOKUP.set('LOG:1', 'Spruce Log');
ITEM_NAMES_LOOKUP.set('LOG:2', 'Birch Log');
ITEM_NAMES_LOOKUP.set('LOG_2:1', 'Dark Oak Log');
ITEM_NAMES_LOOKUP.set('LOG_2', 'Acacia Log');
ITEM_NAMES_LOOKUP.set('LOG:3', 'Jungle Log');

// Basic API request function
function request(endpoint, params, callback) {
	var url = DOMAIN + endpoint + "?" + encodeQueryData(params);
	$.getJSON(url, callback);
}

// Encode query data function
function encodeQueryData(data) {
	const ret = [];
	for (let d in data)
		ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
	return ret.join('&');
}

// Main method to get product list
function getProductList() {
	request("/skyblock/bazaar", {}, async function (result) {
		// Store refresh date
		lastRefresh = new Date();
		// Unpack data
		handleData(result);
	});
}

// Callback handler for the product list
async function handleData(result) {
	if (result.success) {
		// Success, we have data! Store it for use
		apiData = result;

		// Refresh the display
		updateDisplay();
	} else {
		// Failed, request another go
		await new Promise(r => setTimeout(r, 500));
		getProductList();
	}
}

// Prettify item name function. Either looks up the definition in the list
// if available, or else just sentence cases the name.
function prettify(string) {
	var result;
	if (ITEM_NAMES_LOOKUP.has(string)) {
		result = ITEM_NAMES_LOOKUP.get(string);
	} else {
		var sentence = string.toLowerCase().split("_");
		for (var i = 0; i < sentence.length; i++) {
			sentence[i] = sentence[i][0].toUpperCase() + sentence[i].slice(1);
		}
		result = sentence.join(" ");
		result = result.replace(":", " : ");
		result = result.replace(" Item", "");
	}
	return result;
}

function sortItems(type) {

	console.log(type);

	sortByName = false;
	sortBySalesBacklog = false;
	sortByBuyOrder = false;
	sortBySellOffer = false;
	sortByProfitPerItem = false;
	sortByQuantity = false;
	sortByNumOffers = false;
	sortByTotalProfit = false;

	if (type === "Item Name") {
		sortByName = true;
	} else if (type === "Sales Backlog") {
		sortBySalesBacklog = true;
	} else if (type === "Buy Order at") {
		sortByBuyOrder = true;
	} else if (type === "Sell Offer at") {
		sortBySellOffer = true;
	} else if (type === "Profit per Item") {
		sortByProfitPerItem = true;
	} else if (type === "Quantity") {
		sortByQuantity = true;
	} else if (type === "Number of Offers") {
		sortByNumOffers = true;
	} else if (type === "Total Profit") {
		sortByTotalProfit = true;
	} else {
		sortByTotalProfit = true;
	}

	updateDisplay();
}

// Main function that performs calculations and updates the display
function updateDisplay() {
	//#region Items
	// First, set up a list to store our calculated data that will
	// appear in the table
	calcData = [];
	allData = [];
	// And lists to store reasons why items were missed from the table
	var notProfitable = [];
	var notAffordable = [];
	var notSellable = [];
	var hidden = [];
	

	// Iterate over all products...
	for (id in apiData.products) {
		// Get the summaries
		var buySummary = apiData.products[id].buy_summary;
		var sellSummary = apiData.products[id].sell_summary;

		// Check for empty arrays - if yoy can't buy or sell the item then there's
		// no point including it
		if (Array.isArray(buySummary) && Array.isArray(sellSummary) && buySummary.length > 0 && sellSummary.length > 0) {
			// Find the highest buy order price and the lowest sell offer price in the
			// current order/offer lists. This is a bit back-to-front as in the API
			// data, "buySummary" shows what from the user's point of view is "sell
			// offers", whereas "sellSummary" shows "buy orders".
			var lowestSellOffer = Math.min.apply(Math, buySummary.map(function (o) { return o.pricePerUnit; }));
			var highestBuyOrder = Math.max.apply(Math, sellSummary.map(function (o) { return o.pricePerUnit; }));

			// We want to undercut the competition on both sides, so we want to put
			// in a sell offer for the current lowest sell offer minus 0.1 coins/item,
			// and put in a buy order for the current highest buy order plus 0.1.
			var item = {};
			item.id = id;
			item.name = prettify(id);
			item.sellPrice = lowestSellOffer - 0.1;
			item.buyPrice = highestBuyOrder + 0.1;
			item.profitPerItem = (item.sellPrice - item.buyPrice) - item.sellPrice*(taxRate/100); //- taxes

			// Calculate the sales backlog - how many days' worth of sell orders are
			// already on the marketplace - higher backlogs = higher chance you'll be
			// stuck with the items longer before you can sell them.
			sellVolume = apiData.products[id].quick_status.sellVolume;
			sellMovingWeek = apiData.products[id].quick_status.sellMovingWeek;
			item.salesBacklog = sellVolume / (sellMovingWeek / 7.0);
			item.salesPerDay = (sellMovingWeek / 7.0);

			// Work out how many we can afford with our maximum outlay, and
			// the constraint of how many orders we're willing to place
			affordableQuantity = Math.floor(maxOutlay / item.buyPrice);
			item.maxQuantity = Math.min(affordableQuantity, maxOffers * MAX_QUANTITY_PER_ORDER);
			item.numOffersRequired = Math.ceil(item.maxQuantity / MAX_QUANTITY_PER_ORDER);
			item.totalProfit = item.profitPerItem * item.maxQuantity

			//ExpertViews
			item.buyOrders = apiData.products[id].quick_status.buyOrders;
			item.sellOrders = apiData.products[id].quick_status.sellOrders;

			// Only store the data if the item is profitable, and we can afford at
			// least one item, and the sales backlog is below our threshold. Otherwise
			// add the name of the item to a separate list so we can note at the bottom
			// of the table why it's not being displayed.
			allData.push(item);

			if (item.profitPerItem < 0.1) {
				notProfitable.push(item);
			} else if (item.maxQuantity <= 0) {
				notAffordable.push(item);
			} else if (item.salesBacklog > maxBacklog) {
				notSellable.push(item);
			} else if (hiddenItems.includes(item.name)) {
				hidden.push(item);
			} else {
				calcData.push(item);
			}
		}
	}

	// Apply the required sort to the data
	if (sortByName) {
		calcData.sort((a, b) => (a.name > b.name) ? 1 : -1);
	} else if (sortByBuyOrder) {
		calcData.sort((a, b) => (a.buyPrice > b.buyPrice) ? 1 : -1);
	} else if (sortBySellOffer) {
		calcData.sort((a, b) => (a.sellPrice > b.sellPrice) ? 1 : -1);
	} else if (sortBySalesBacklog) {
		calcData.sort((a, b) => (a.salesBacklog > b.salesBacklog) ? 1 : -1);
	} else if (sortByQuantity) {
		calcData.sort((a, b) => (a.profitPerItem > b.profitPerItem) ? -1 : 1);
	} else if (sortByProfitPerItem) {
		calcData.sort((a, b) => (a.maxQuantity > b.maxQuantity) ? -1 : 1);
	} else if (sortByNumOffers) {
		calcData.sort((a, b) => (a.numOffersRequired > b.numOffersRequired) ? -1 : 1);
	} else if (sortByTotalProfit) {
		calcData.sort((a, b) => (a.totalProfit > b.totalProfit) ? -1 : 1);
	} else {
		calcData.sort((a, b) => (a.name > b.name) ? 1 : -1);
	}

	// Create table header. If maxOffers is >1, an extra column is added to show
	// the number of offers required to buy/sell that many items
	var table = $('<table>').addClass('results');
	var headerFields = "<th onclick='sortItems(\"Item Name\")'>Item Name</th>" +
		"<th onclick='sortItems(\"Sales Backlog\")'>Sales Backlog</th>" +
		"<th onclick='sortItems(\"Buy Order at\")'>Buy at</th>" +
		"<th onclick='sortItems(\"Sell Offer at\")'>Sell at</th>" +
		"<th onclick='sortItems(\"Profit per Item\")'>per Item</th>" +
		"<th onclick='sortItems(\"Quantity\")'>Quantity</th>";
	if (maxOffers > 1) {
		headerFields += "<th onclick='sortItems(\"Number of Offers\")'>Offers</th>";
	}

	headerFields += "<th onclick='sortItems(\"Total Profit\")'>Profit</th>";

	if (transactionLog || expertMode) {
		headerFields += "<th>Actions</th>";
	}	var header = $('<tr>').html(headerFields);
	table.append(header);

	// Create table rows
	calcData.forEach(function (item, index) {

		/* Name + Wiki + 24h Graph */
		var rowFields = "<td><a target='_blank' href='https://hypixel-skyblock.fandom.com/wiki/" + item.name.toString().replace(" ", "_") + "'>" + item.name;
		if (expertMode) {
			rowFields += "<br><a target='_blank' href='https://bazaartracker.com/product/" + item.name.toString().replace(" ", "_") + "'class='small'>24 hour graph</span>";
		}
		rowFields += "</td>";




		/* Sales Backlog */
		var color = "";
		if (item.salesBacklog > 6) { color = "color-red"; }
		if (item.salesBacklog < 6) { color = "color-yellow"; }
		if (item.salesBacklog < 4) { color = "color-black"; }
		if (item.salesBacklog < 1) { color = "color-green"; }

		rowFields += "<td class='text-end " + color + "' onclick='copyTextToClipboard(\"" + item.salesBacklog.toFixed(1) + "\")'>" + numberWithCommas(item.salesBacklog.toFixed(1));
		if (expertMode) {
			rowFields += "</br><span class='small " + color + "'>" + (item.salesPerDay).toFixed(0) + " a day</span>"
		}
		rowFields += "</td>"

		/* BuyAt */
		rowFields += "<td class='text-end' onclick='copyTextToClipboard(\"" + item.buyPrice.toFixed(1) + "\")'>" + numberWithCommas(item.buyPrice.toFixed(1)); //<span id='BP"+item.name+"'></span>
		if (expertMode) {
			if (item.buyOrders > 500) { color = "color-green"; }
			if (item.buyOrders < 500) { color = "color-black"; }
			if (item.buyOrders < 100) { color = "color-yellow"; }
			if (item.buyOrders < 50) { color = "color-red"; }

			rowFields += "</br><span class='small " + color + "'>" + item.buyOrders + " Ord.</span>"
		}
		rowFields += "</td>";

		/* 	document.getElementById("BP"+item.name).innerHTML = "..."; TODO - AVG Price
		setTimeout(function(){ 
			//delay!
			var url = "https://sky.coflnet.com/api/item/price/"+item.name.toString().replace(" ","_")+"/history/month?";
			$.getJSON(url, async function(result) {
				document.getElementById("BP"+item.name).innerHTML = average(result, item.name);
			});
		}, 2000*index); */


		/* Sell At */
		rowFields += "<td class='text-end' onclick='copyTextToClipboard(\"" + item.sellPrice.toFixed(1) + "\")'>" + numberWithCommas(item.sellPrice.toFixed(1));
		if (expertMode) {
			if (item.sellOrders > 500) { color = "color-green"; }
			if (item.sellOrders < 500) { color = "color-black"; }
			if (item.sellOrders < 100) { color = "color-yellow"; }
			if (item.sellOrders < 50) { color = "color-red"; }
			rowFields += "</br><span class='small " + color + "'>" + item.sellOrders + " Ord.</span>"
		}
		rowFields += "</td>";

		/* Per Item */
		rowFields += "<td class='text-end' onclick='copyTextToClipboard(\"" + item.profitPerItem.toFixed(1) + "\")'>" + numberWithCommas(item.profitPerItem.toFixed(1));
		if (expertMode) {
		}
		rowFields += "</td>";

		/* Quantity */
		rowFields += "<td class='text-end' onclick='copyTextToClipboard(\"" + item.maxQuantity.toFixed(1) + "\")'>" + numberWithCommas(item.maxQuantity);
		if (expertMode) {

			var invs = (item.maxQuantity / 2304).toFixed(1); /* /2304 = Inventare */

			if (invs > 25) { color = "color-red"; }
			if (invs < 25) { color = "color-yellow"; }
			if (invs < 15) { color = "color-black"; }
			if (invs < 2) { color = "color-green"; }
			rowFields += "<br><span class='small " + color + "'>" + invs + " Inv.</span>";
		}
		rowFields += "</td>";

		//  If maxOffers is >1, an extra column is added to show
		// the number of offers required to buy/sell that many items
		if (maxOffers > 1) {
			rowFields += "<td>" + numberWithCommas(item.numOffersRequired) + "</td>";
		}

		rowFields += "<td class='text-end'>" + numberWithCommas(item.totalProfit.toFixed(0));
		if (expertMode) {

			var marginPercent = ((item.sellPrice / item.buyPrice) * 100 - 100).toFixed(2);

			if (marginPercent > 500) { color = "color-green"; }
			if (marginPercent < 500) { color = "color-black"; }
			if (marginPercent < 5) { color = "color-yellow"; }
			if (marginPercent < 2) { color = "color-red"; }

			rowFields += "<br><span class='small nowrap " + color + "'>" + marginPercent + "%</span>"
		}
		rowFields += "</td>";

		/* Actions */
		if (transactionLog || expertMode) {
			rowFields += "<td>";
			/* TODO: Actions */
			if (transactionLog) {
				rowFields += "<img onclick='buyTransaction(\""+item.id+"\")' width='24px' style='padding: 2px' src='img/chestBuy.png'>";
				rowFields += "<img onclick='sellTransaction(\""+item.id+"\")' width='24px' style='padding: 2px' src='img/chestSell.png'>";
			}
			if (expertMode) {
				rowFields += "<img onclick='hideItem(\"" + item.name + "\")' width='26px' src='img/gray_dye.png'>";
				rowFields += "<img onclick='favorite(\"" + item.name + "\")' width='26px' src='img/nether_star.png'>";
				rowFields += "</td>";
			}
		}
		var classes = "highlight";
		if(favorites.includes(item.name)){
			classes += " favorite";
		}
		var row = $('<tr class="'+classes+'">').html(rowFields);
		// Add to table
		table.append(row);
	});

	// Update DOM
	$('#table').html(table);

	// Create explanation of missing items
	var missingItemExplanation = '';

	if (hidden.length > 0) {
		hidden.sort((a, b) => (a.name > b.name) ? -1 : 1);
		missingItemExplanation += '<p><b>Items excluded from the table because you hid them:</b><br/>' + hidden.map(function (o) { return (o.name + '<a style="color: blue" onclick="unhideItem(\'' + o.name + '\')"> (Unhide)</a>'); }).join(', ') + '</p>';
	}
	if (notProfitable.length > 0) {
		notProfitable.sort((a, b) => (a.profitPerItem > b.profitPerItem) ? -1 : 1);
		missingItemExplanation += '<p><b>Items excluded from the table because they are not profitable:</b><br/>' + notProfitable.map(function (o) { return (o.name + ' (' + Math.abs(o.profitPerItem).toFixed(1) + ' loss)'); }).join(', ') + '</p>';
	}
	if (notAffordable.length > 0) {
		notAffordable.sort((a, b) => (a.buyPrice > b.buyPrice) ? -1 : 1);
		missingItemExplanation += '<p><b>Items excluded from the table because you cannot afford one:</b><br/>' + notAffordable.map(function (o) { return (o.name + ' (' + o.buyPrice.toFixed(1) + ' per item)'); }).join(', ') + '</p>';
	}
	if (notSellable.length > 0) {
		notSellable.sort((a, b) => (a.salesBacklog > b.salesBacklog) ? -1 : 1);
		missingItemExplanation += '<p><b>Items excluded from the table because the sales backlog is too long:</b><br/>' + notSellable.map(function (o) { return (o.name + ' (' + o.salesBacklog.toFixed(1) + ' days)'); }).join(', ') + '</p>';
	}
	$('#missingItemExplanation').html(missingItemExplanation);
	//#endregion

	/* Transactionen */
	if(transactionLog && transactions.length > 0){
	var transactionTable = $('<table style="margin-top:0px;border: none;">').addClass('results');
	headerFields = "<th>Date</th><th>Item</th><th>Type</th><th>Price</th><th>Count</th><th>Saldo</th><th>Actions</th>";

	var header = $('<tr>').html(headerFields);
	transactionTable.append(header);

	// Create table rows
	transactions.forEach(function (item, index) {

		/* Date */
 		var rowFields = "<td>" + moment(item.date).fromNow();   /* .toLocaleTimeString('en-us', {hour12:false, month:"short", day:"numeric"}); */
		 rowFields += "</td>";

		/* Name + Wiki + 24h Graph */
		rowFields += "<td><a target='_blank' href='https://hypixel-skyblock.fandom.com/wiki/" + item.name.toString().replace(" ", "_") + "'>" + item.name;
		if (expertMode) {
			rowFields += "<br><a target='_blank' href='https://bazaartracker.com/product/" + item.name.toString().replace(" ", "_") + "'class='small'>24 hour graph</span>";
		}
		rowFields += "</td>";
		/* Sell/BUY */
		rowFields += "<td><select class='borderless-input' id='TY"+item.id+"' onchange='chanceType(\""+item.id+"\")'>";

		if (item.type ==="sell"){
			rowFields += "<option value='sell' selected>sell</option><option value='buy'>buy</option>";
		} else {
			rowFields += "<option value='sell'>sell</option><option value='buy' selected>buy</option>";
		}
		
		"</select></td>";

		/* Price */
		rowFields += "<td><input onchange='chancePrice(\""+item.id+"\")' class='text-end borderless-input' id='PR"+item.id+"' value='"+item.price+"' type='text'>";
		if (expertMode) {
			item.price = parseFloat(item.price);

			var buyPrice = parseFloat(getBuyPriceByName(item.name).toFixed(2)); 
			var buyColor = "color-black";

			if(item.type === "buy"){
			//if order is fullfilled, colors should be different > you buy at 100 new buy is 200 > profit 
			if(item.price === buyPrice){ //0.00%
				buyColor = "color-green"
			} else if (item.price < buyPrice*1.02 && item.price > buyPrice*-1.02){ //2%
				buyColor = "color-black"
			} else if (item.price < buyPrice*1.05 && item.price > buyPrice*-1.05){ //5%
				buyColor = "color-yellow"
			} else{ //bigger diffrence
				buyColor = "color-red"
			}
			} else {
				buyColor = "color-gray"
			}
			
			var sellPrice = parseFloat(getSellPriceByName(item.name).toFixed(2)); 
			var sellColor = "color-black";

			if(item.type === "sell"){
			//if order is fullfilled, colors should be different > you buy at 100 new buy is 200 > profit 
			if(item.price === sellPrice){ //0.00%
				sellColor = "color-green"
			} else if (item.price*-1.02 < sellPrice && item.price*1.02 > sellPrice){ //2%
				sellColor = "color-black"
			} else if (item.price*-1.05 < sellPrice&& item.price*1.05 > sellPrice){ //5%
				sellColor = "color-yellow"
			} else{ //bigger diffrence
				sellColor = "color-red"
			}
			} else {
				sellColor = "color-gray"
			}

			rowFields += "<br><img width='12px' style='padding: 2px' src='img/chestBuy.png'><span class='small nowrap " + buyColor + "'>" + buyPrice +"</span>"
			rowFields += "<img width='12px' style='padding: 2px' src='img/chestSell.png'><span class='small nowrap " + sellColor + "'>" + sellPrice +"</span>"
		}


		rowFields += "</td>";


		/* Count */
		rowFields += "<td><input onchange='chanceCount(\""+item.id+"\")' class='text-end borderless-input' id='CO"+item.id+"' value='"+item.count+"' type='text'></td>";

		var prefix = 1;
		if(item.type === "buy"){
			prefix = -1;
			color = "color-red";
		} else {
			color = "color-green"
		}

		item.saldo = prefix*item.price*item.count;
		rowFields += "<td class='text-end " + color + "'>" + numberWithCommas((item.saldo).toFixed(0)) + "</td>";
		

		/* Actions */
		rowFields += "<td>";
		if(item.type === "buy"){
		rowFields += "<img onclick='flipBuyTransaction(\""+item.id+"\")' width='24px' style='padding: 2px' src='img/chestSell.png'>";
		} else {
		rowFields += "<img onclick='flipSellTransaction(\""+item.id+"\")' width='24px' style='padding: 2px' src='img/chestBuy.png'>";
		}

		/* Delete */
		rowFields += "<img onclick='deleteTransaction(\""+item.id+"\")' width='24px' style='padding: 2px' src='img/lava_bucket.png'>";
		/* Copy */
		rowFields += "<img onclick='copyTransaction(\""+item.id+"\")' width='24px' style='padding: 2px' src='img/copy_dye.png'>";

		rowFields += "</td>";


		var row = $('<tr class="highlight">').html(rowFields);

		// Add to table
		transactionTable.append(row);
	});

	//saldo
	var saldo = transactions.reduce((r, c) => r + c.saldo, 0).toFixed(0)
	var taxes = 0;
	transactions.forEach(tr => {
		if(tr.saldo > 0){//Taxes only on SELL
			taxes += tr.saldo*(taxRate/100);
		}
	});
	taxes = taxes.toFixed(0);

	if(saldo < 0){
		color = "color-red";
	} else {
		color = "color-green"
	}

	var sum = "<tr class='borderless'><td class='color-red' onclick='deleteAllTransactions(\"a\");'>DELETE</br></br></td><td></td><td></td><td></td><td>growth:</br>taxes:</br>profit:</br></td>";
	sum += "<td class='text-end'><span class='"+color+"'>"+numberWithCommas(saldo)+"</span></br><span class='color-red'>-"+numberWithCommas(taxes)+"</span></br><span class='"+color+"'>"+numberWithCommas(saldo-taxes)+"</span></br></td></tr>";
	transactionTable.append(sum);
	// Update DOM
	$('#transactionsTable').html(transactionTable);
	} else {
		$('#transactionsTable').html("");	
	}

	//save on every input change
	save();
}

function getBuyPriceByName(itemName){
	var result = allData.filter(obj => {
		return obj.name === itemName;
	})

	return result[0].buyPrice;
}

function getSellPriceByName(itemName){
	var result = allData.filter(obj => {
		return obj.name === itemName;
	})

	return result[0].sellPrice;
}

function buyTransaction(item){
	var result = calcData.filter(obj => {
		return obj.id === item;
	})
	var copy = JSON.parse(JSON.stringify(result[0])); //TO COPY, not REFERENZ

	copy.date = new Date();
	copy.id = uuidv4();
	copy.type = "buy";
	copy.price = copy.buyPrice.toFixed(1);
	copy.count = copy.maxQuantity.toFixed(1);

	transactions.push(copy);
	updateDisplay();
}

function sellTransaction(item){
	var result = calcData.filter(obj => {
		return obj.id === item;
	})
	var copy = JSON.parse(JSON.stringify(result[0])); //TO COPY, not REFERENZ

	copy.date = new Date();
	copy.id = uuidv4();
	copy.type = "sell";
	copy.price = copy.sellPrice.toFixed(1);
	copy.count = copy.maxQuantity.toFixed(1);

	transactions.push(copy);
	updateDisplay();
}


function deleteAllTransactions(){
	transactions = [];
	updateDisplay();
}

function copyTransaction(item){
	var result = transactions.filter(obj => {
		return obj.id === item;
	})
	var orginal = JSON.parse(JSON.stringify(result[0])); //TO COPY, not REFERENZ

	orginal.date = new Date();
	orginal.id = uuidv4();

	transactions.push(orginal);
	updateDisplay();
}

function flipBuyTransaction(item){
	var result = transactions.filter(obj => {
		return obj.id === item;
	})
	var orginal = JSON.parse(JSON.stringify(result[0])); //TO COPY, not REFERENZ

	orginal.date = new Date();
	orginal.id = uuidv4();
	orginal.type = "sell";

	transactions.push(orginal);
	updateDisplay();
}

function flipSellTransaction(item){
	var result = transactions.filter(obj => {
		return obj.id === item;
	})
	var orginal = JSON.parse(JSON.stringify(result[0]));

	orginal.date = new Date();
	orginal.id = uuidv4();
	orginal.type = "buy";

	transactions.push(orginal);
	updateDisplay();
}


function chanceType(item){
	var type = document.getElementById("TY"+item).value;

	var result = transactions.filter(obj => {
		return obj.id === item;
	})

	result[0].type = type;
	updateDisplay();
}

function chancePrice(item){
	var price = document.getElementById("PR"+item).value;

	var result = transactions.filter(obj => {
		return obj.id === item;
	})

	result[0].price = price;
	updateDisplay();
}

function chanceCount(item){
	var price = document.getElementById("CO"+item).value;

	var result = transactions.filter(obj => {
		return obj.id === item;
	})

	result[0].count = price;
	updateDisplay();
}

function deleteTransaction(item){
	var result = transactions.filter(obj => {
		return obj.id !== item;
	})

	transactions = result;
	updateDisplay();
}

// Run on startup:

// Bind UI inputs to set internal values and update UI
$('#maxOutlay').val(maxOutlay);
$('#maxOutlay').keyup(function () {
	maxOutlay = $(this).val();
	updateDisplay();
});
$('#maxOffers').val(maxOffers);
$('#maxOffers').keyup(function () {
	maxOffers = $(this).val();
	updateDisplay();
});
$('#maxBacklog').val(maxBacklog);
$('#maxBacklog').keyup(function () {
	maxBacklog = $(this).val();
	updateDisplay();
});

$('#taxRate').val(taxRate);
$('#taxRate').keyup(function () {
	taxRate = $(this).val();
	updateDisplay();
});

$('input.settings').on('change', function () {
	expertMode = $('input#expertMode').is(":checked");
	transactionLog = $('input#transactionLog').is(":checked");
	npcDeals = $('input#npcDeals').is(":checked");
	updateDisplay();
});

$('button#helpButton').click(function () {
	$('div.help').toggle("fast");
});

$('button#refreshButton').click(function () {
	getProductList();

	/* https://sky.coflnet.com/item/FLINT?itemFilter=&range=week */
});

//local Settings
load();

function favorite(itemName) {
	if(favorites.includes(itemName)){
		favorites = favorites.filter(function (item) {
			return item !== itemName;
		})
	} else {
		favorites.push(itemName);
	}
	updateDisplay();
}

function hideItem(itemName) {
	hiddenItems.push(itemName);
	updateDisplay();
}

function unhideItem(itemName) {
	hiddenItems = hiddenItems.filter(function (item) {
		return item !== itemName;
	})
	updateDisplay();
}

function save() {
	localStorage.setItem("favorites", JSON.stringify(favorites));
	localStorage.setItem("hiddenItems", JSON.stringify(hiddenItems));
	localStorage.setItem("transactions", JSON.stringify(transactions));
	localStorage.setItem("expertMode", expertMode);
	localStorage.setItem("transactionLog", transactionLog);
	localStorage.setItem("npcDeals", npcDeals);
	localStorage.setItem("maxOutlay", maxOutlay);
	localStorage.setItem("maxOffers", maxOffers);
	localStorage.setItem("maxBacklog", maxBacklog);
	localStorage.setItem("taxRate", taxRate);
}

function load() {
	hiddenItemsLoad = JSON.parse(localStorage.getItem("hiddenItems"));
	if (hiddenItemsLoad !== null) {
		hiddenItems = hiddenItemsLoad;
	}

	favoritesLoad = JSON.parse(localStorage.getItem("favorites"));
	if (favoritesLoad !== null) {
		favorites = favoritesLoad;
	}

	transactionsLoad = JSON.parse(localStorage.getItem("transactions"));
	if (transactionsLoad !== null) {
		transactions = transactionsLoad;
	}
	
	expertModeLoad = JSON.parse(localStorage.getItem("expertMode"));
	if (expertModeLoad !== null) {
		expertMode = expertModeLoad;
		document.getElementById("expertMode").checked = expertMode;
	}
	transactionLogLoad = JSON.parse(localStorage.getItem("transactionLog"));
	if (transactionLogLoad !== null) {
		transactionLog = transactionLogLoad;
		document.getElementById("transactionLog").checked = transactionLog;
	}

	npcDealsLoad = JSON.parse(localStorage.getItem("npcDeals"));
	if (npcDealsLoad !== null) {
		npcDeals = npcDealsLoad;
		document.getElementById("npcDeals").checked = npcDeals;
	}

	maxOutlayLoad = JSON.parse(localStorage.getItem("maxOutlay"));
	if (maxOutlayLoad > 0) { 
		maxOutlay = maxOutlayLoad;
		document.getElementById("maxOutlay").value = maxOutlay; 
	};

	maxOffersLoad = JSON.parse(localStorage.getItem("maxOffers"));
	if (maxOffersLoad > 0) { 
		maxOffers = maxOffersLoad;
		document.getElementById("maxOffers").value = maxOffers; 
	};

	maxBacklogLoad = JSON.parse(localStorage.getItem("maxBacklog"));
	if (maxBacklogLoad > 0) { 
		maxBacklog = maxBacklogLoad;
		document.getElementById("maxBacklog").value = maxBacklog; 
	};

	taxRateLoad = JSON.parse(localStorage.getItem("taxRate"));
	if (taxRateLoad > 0) { 
		taxRate = taxRateLoad;
		document.getElementById("taxRate").value = taxRate; 
	};
	
	// Get the data from the Skyblock API
	getProductList();
}

/* Helper */
const average = (arr, name) => {
	const na = name;
	const { length } = arr;
	return arr.reduce((acc, val) => {
		return acc + (val.avg / length);
	}, 0);
};

/* function average(prices){

	let filteredData = prices.filter(({ gender }) => 'female' == 'female'),
	average = filteredData.reduce((r, c) => r + c.avg, 0) / filteredData.length;



	//let filteredData = prices.filter(true);
	//const average = filteredData.reduce((r, c) => r + c.avg, 0) / filteredData.length;// prices.reduce((total, next) => total + next.avg, 0) / prices.length;
	return average;
} */

function numberWithCommas(x) {
	return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, " ");
}

function copyTextToClipboard(text) {
	if (!navigator.clipboard) {
		return;
	}
	navigator.clipboard.writeText(text).then(function () {
		console.log('Async: Copying to clipboard was successful!');
	}, function (err) {
		console.error('Async: Could not copy text: ', err);
	});
}

function uuidv4() {
	return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
	  (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
	);
  }
