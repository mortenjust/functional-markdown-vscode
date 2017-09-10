// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var chrono = require('chrono-node')
var moment = require('moment')
var fs = require("fs")
var momentTz = require("moment-timezone")
var math = require('mathjs')
var fetch = require('node-fetch')
var geoip = require('geoip-lite');
var timezones = require('./timezones.js')
const publicIp = require('public-ip');


var autoSaveTimer;
var decorationTimeout;
var timezoneDecoration;
var timezoneDecos = [];

var wordCountStatusBarItem;

var externalIp;


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    console.log("activated, removing line numbers")
    vscode.window.activeTextEditor.options.lineNumbers = 0; // don't need these for notes
    vscode.workspace.getConfiguration().update("markdown.preview.breaks", false)

    registerCompletions()
    fetchAndImportCurrencies()
    defineDecorations()
    setupStatusBar()
    getPublicIp()
    simplifyTitlebar()

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => documentChanged(e)));

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "functional-markdown" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var disposable = vscode.commands.registerCommand('extension.sayHello', function () {
        // The code you place here will be executed every time your command is executed

        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
}
exports.activate = activate;

function maybeAutoSave(){    
    clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(function() {
        // console.log("...aaaand saving all")
        vscode.workspace.saveAll() 
    }, 1000);
}

function simplifyTitlebar(){
  // vscode.window.title = "KASSEMAD"
  
}

function getPublicIp(){
// https://github.com/sindresorhus/public-ip
publicIp.v4().then(ip => {
    console.log("V4 publicip: " + ip);	
    if(ip){
        externalIp = ip
    }
}).catch(reason => {
    console.log('no v4 ip, sorry '+reason);    
});

publicIp.v6().then(ip => {
    console.log("V6 publicip: " + ip);	
    if(ip){
        externalIp = ip
    }
}).catch(reason => {
  console.log('No v6 ip sorry: '+reason);
});
}

function setupStatusBar(){    
    
}

function getWordCount(doc)  {
  let docContent = doc.getText();
  // Parse out unwanted whitespace so the split is accurate
  docContent = docContent.replace(/(< ([^>]+)<)/g, '').replace(/\s+/g, ' ');
  docContent = docContent.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
  let wordCount = 0;
  if (docContent != "") {
      wordCount = docContent.split(" ").length;
  }
  return wordCount;
}

function updateWordCount(d){
  const w = getWordCount(d)

  // Create as needed
      if (!wordCountStatusBarItem) {
        wordCountStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        wordCountStatusBarItem.text = "heje"
        wordCountStatusBarItem.show()
    } 
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        wordCountStatusBarItem.hide();
        return;
    }
    // Only update status if an MD file
    if (d.languageId === "markdown") {
        // Update the status bar
        wordCountStatusBarItem.text = w !== 1 ? `$(pencil) ${w} Words` : '$(pencil) 1 Word';
        wordCountStatusBarItem.show();
    } else {
      wordCountStatusBarItem.hide();
    }    
}

function documentChanged(e) {    
    maybeAutoSave()
    triggerUpdateDecorations()
    
    const justTyped = e.contentChanges[0].text;
    const pos = vscode.window.activeTextEditor.selection.active;
    const doc = vscode.window.activeTextEditor.document;
    // console.log("Just typed:"+justTyped)
    updateWordCount(doc)

    if (justTyped == "()" || justTyped == "=") { // user is trying to do math
        console.log("Entering '( or ='");
        // let's convert the previous sentence with chrono.js and mathjs
        // get wordrange at position filters out spaces
        const endPos = pos;
        var startPos = new vscode.Position(endPos.line, endPos.character - 1);
        var queryString = "te";
        var startChar = startPos.character
        var spacePadded = false
        var stopChars=/[\n?!\-]/ // periods, newlines, colons, hyphens

        // while (!queryString.includes(stopChars) && (startPos.character != 0)) {

        // now move backwards until we meet a stop char
        while (!stopChars.test(queryString) && (startPos.character != 0)) {
            startPos = new vscode.Position(startPos.line, startChar);
            queryString = doc.getText(new vscode.Range(startPos, endPos));
            if(queryString == " " && justTyped != "()"){console.log("using space"); spacePadded = true }
            // console.log("string is now: " + queryString);
            startChar--
        }

        // queryString = queryString.replace(". ", "");
        queryString = queryString.replace(stopChars, "").trim()
        console.log("Final string is " + queryString);

        // 9am in san francisco in copenhagen = 
        var regexTimeInIn = /((?:\d+:)*\d+(?:[ap]m)*) in ([A-Za-z]+) in (.*)/
        var regexTimeIn = /((?:\d+:)*\d+(?:[ap]m)*) in ([A-Za-z]+)/
        // var regexPctOf = /([\d]+[.\d]*) ?% of ([\d]+[.\d]*)/
        var regexPctOf = /([\d\.]+) ?% of ([\d\.]+)/

        // console.log('Testing !'+queryString+"! for PctOf: "+regexPctOf.test(queryString));
        // console.log(regexPctOf.exec(queryString))


        if (regexTimeInIn.test(queryString)) {
            console.log("> Time IN IN ")
            var tzResult = regexTimeInIn.exec(queryString)
            console.log(tzResult) // TODO - this one is never executed
            var hhmm = tzResult[1]
            var fromCity = tzResult[2]
            var toCity = tzResult[3]
            console.log("ready to convert "+hhmm+" in the city of "+fromCity+" to the city of "+toCity)

            var fromTz =  getTimezoneForUserInput(fromCity)
            var toTz = getTimezoneForUserInput(toCity)

            formattedResult = moment.tz(hhmm, "h:mmA", fromTz.utc[0]).tz(toTz.utc[0]).format('h:mma')
            formattedResult = cleanUpTimeResult(formattedResult)

            // 9am in Berlin =
        } else if (regexTimeIn.test(queryString)) {
                console.log("> Time IN")
                var r = regexTimeIn.exec(queryString)
                var hhmm = r[1]
                var fromTz = getTimezoneForUserInput(r[2])

                const localZone = moment.tz.guess()                 
                const geo = geoip.lookup(externalIp);
                console.log(geo.city)

                formattedResult = moment.tz(hhmm, "h:mmA", fromTz.utc[0]).tz(localZone).format("h:mma") + " in "+geo.city;
                formattedResult = cleanUpTimeResult(formattedResult)

        } else if (regexPctOf.test(queryString)) { // 20 % of 100 =
            console.log('> regexPctOf');            
            var r = regexPctOf.exec(queryString)
            var pct = parseFloat(r[1])
            var n = parseFloat(r[2])
            console.log(pct + " / 100 * " + n)
            console.log(r)
            var formattedResult = "" + math.format((pct/100 * n), {notation:'fixed', precision: 2}).toLocaleString()
        }  else { 
                // throw it to the date/math parsers
                var result = chrono.parseDate(queryString)
                var formattedResult = moment(result).format('MMM Do YYYY, h:mm a')

                if (formattedResult == "Invalid date") {
                    // console.log("Invalid date")
                    // try mathjs?
                    var mathResult = math.format(math.eval(queryString), {notation: 'fixed', precision: 2}).toLocaleString()
                    console.log("math result: "+mathResult)
                    formattedResult = format(mathResult)
                }

        }

        // last bit here assumes formatted result coming from the above. TODO: Refactor into better pattern
        var insertPos = new vscode.Position(pos.line, pos.character+1)
        if(spacePadded){formattedResult = " " + formattedResult}
        insertAndSelectStringAtPos(insertPos, formattedResult)
    }
}

function cleanUpTimeResult(t){
    var nt = t.replace(":00", "")
    return nt
}

function getTimezoneForUserInput(userInput){
    var lf = userInput.toLowerCase()
    var determinedZone
 
    timezones.map(t => {
        if(t.text.toLowerCase().includes(lf)){
          determinedZone = t
        }
    
        if(t.value.toLowerCase().includes(lf)){
          determinedZone = t
        }
    
        if(t.abbr.toLowerCase() == lf) {
          determinedZone = t
        }
    
        if(t.utc){
          t.utc.map(u => {
            if(u.toLowerCase().replace("_", " ").includes(lf)){
              determinedZone = t
            }
          })
        }
    })

    return determinedZone
}


function insertAndSelectStringAtPos(insertPos, str){
            vscode.window.activeTextEditor.edit(builder => {
                builder.insert(insertPos, str);
            });

//  Maybe don't select stuff anyway

            // vscode.window.activeTextEditor.selection = new vscode.Selection(
            //         insertPos, 
            //         new vscode.Position(insertPos.line, insertPos.character + str.length + 1));    

}


function registerCompletions(){

       vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("tomorrow", vscode.CompletionItemKind.Reference)
            ci.insertText = "" + moment().add(1, 'days').format("ddd MMMM Do YYYY")
            ci.label = "Tomorrow: " + ci.insertText
            ci.filterText = "tomorrow"
            return [ci]
        }
       });

        // now
        	vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("time", vscode.CompletionItemKind.Text)
            ci.insertText = "" + moment().format("h:mm a")
            ci.kind = vscode.CompletionItemKind.Reference
            ci.label = ci.insertText
            ci.filterText = "time"
            return [ci]
        }
        });

        vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("now", vscode.CompletionItemKind.Text)
            ci.insertText = "" + moment().format("h:mm a")
            ci.kind = vscode.CompletionItemKind.Reference
            ci.label = ci.insertText
            ci.filterText = "now"
            return [ci]
        }
        });


        	vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("date", vscode.CompletionItemKind.Text)
            ci.insertText = "" + moment().format("ddd MMMM Do YYYY")
            ci.label = "" + moment().format("ddd MMMM Do YYYY")
            ci.filterText = "date"
            ci.commitCharacters = ['\t']
            ci.kind = vscode.CompletionItemKind.Reference
            return [ci]
        }
       });


        vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("today", vscode.CompletionItemKind.Reference)
            ci.insertText = "" + moment().format("ddd MMMM Do YYYY")
            ci.label = "Today: " + moment().format("ddd MMMM Do YYYY")            
            ci.filterText = "today"
            return [ci]
        }
       });

        vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("yesterday", vscode.CompletionItemKind.Reference)
            ci.insertText = "" + moment().add(-1, 'days').format("ddd MMMM Do YYYY")               
            ci.label = "" + moment().add(-1, 'days').format("ddd MMMM Do YYYY")               
            ci.filterText = "yesterday"
            return [ci]
        }
       });

        	vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("datetime", vscode.CompletionItemKind.Reference)
            ci.insertText = "" + moment().format("ddd MMMM Do YYYY h:mm a")
            ci.label = ci.insertText
            ci.filterText = "datetime"
            return [ci]
        }
    });
        	vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("this week number", vscode.CompletionItemKind.Reference)
            ci.insertText = "" + moment().week()
            ci.label = "Week number (" + moment().week() + ")"
            ci.filterText = "week number"
            return [ci]
        }
    });
}

function format(n) {
    return n.toLocaleString();
}

// this method is called when your extension is deactivated
function deactivate() {
}

  function fetchAndImportCurrencies () {
    // fetch actual currency conversion rates
    return fetch('https://api.fixer.io/latest')
        .then(function (response) {
          return response.json();
        }).then(function (data) {
          // import the currencies
          math.createUnit(data.base)
          Object.keys(data.rates).forEach(function (currency) {
            math.createUnit(currency, math.unit(1 / data.rates[currency], data.base));
            math.createUnit(currency.toLowerCase(), math.unit(1 / data.rates[currency], data.base));
          });
          // return an array with all available currencies
          return Object.keys(data.rates).concat(data.base);
        });
  }

// #decorations

function defineDecorations(){
    timezoneDecoration = vscode.window.createTextEditorDecorationType({
        borderWidth: '1px',
        borderStyle: 'none none dashed none',
        borderColor: '#5c6371',
        // backgroundColor: 'blue',        
        
        textDecoration: 'margin-left:20px',
        // overviewRulerLane: vscode.OverviewRulerLane.Right
        // overviewRulerColor: 'blue', // this is the scroll bar area        
    })
    triggerUpdateDecorations()    
}

function updateDecorations(){
  let activeEditor = vscode.window.activeTextEditor;
  timezoneDecos = []
  updateTimezoneDecoration(/London/gm, "London")
  updateTimezoneDecoration(/Copenhagen/gm, "Copenhagen") 
  updateTimezoneDecoration(/New York/gm, "New York")    
  activeEditor.setDecorations(timezoneDecoration, timezoneDecos) 
}

function triggerUpdateDecorations(){
    		if (decorationTimeout) {
			clearTimeout(decorationTimeout);
		}
		decorationTimeout = setTimeout(updateDecorations, 500);
}

function timeStringForIdentifier(i, friendlyName){
    return "**" + moment().tz(i).format("HH:MM ddd")  + "** \n in "+friendlyName
}

function updateDecoration(trigger, hoverMsg, decorationType){
    var regEx = trigger
    let activeEditor = vscode.window.activeTextEditor;
    const text = activeEditor.document.getText();
    let match;

	
    while (match = regEx.exec(text)) {
        
        const startPos = activeEditor.document.positionAt(match.index);
        const endPos = activeEditor.document.positionAt(match.index + match[0].length);
        const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: hoverMsg };
        timezoneDecos.push(decoration)

    }
    // console.log("setting decos")
    // console.log(timezoneDecos)

    
}

function updateTimezoneDecoration(cityNameRegexp, cityName){
    // helper for timezone 
    updateDecoration(cityNameRegexp, timeInCityString(cityName), timezoneDecoration)
}


function timeInCityString(city){
    var timeString;
    // moment().tz("Europe/London").format("HH:MM dddd")
    switch (city) {
        case "London":
            timeString = timeStringForIdentifier("Europe/London", "London, UK")
            break;    
        case "Copenhagen":
            timeString = timeStringForIdentifier("Europe/Copenhagen", "Copenhagen, Denmark")
            break;
        case "New York":
            timeString = timeStringForIdentifier("America/New_York", "New York, NY")
            break;
        default:
            break;
    }
    return timeString;
}



exports.deactivate = deactivate;


