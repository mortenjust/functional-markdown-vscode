// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var chrono = require('chrono-node')
var moment = require('moment')
var math = require('mathjs')
var fetch = require('node-fetch')

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    console.log("activated, removing line numbers")
    vscode.window.activeTextEditor.options.lineNumbers = 0; // don't need these for notes

    registerCompletions()
    fetchAndImportCurrencies()
    
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

function documentChanged(e) {
    const justTyped = e.contentChanges[0].text;
    const pos = vscode.window.activeTextEditor.selection.active;
    const doc = vscode.window.activeTextEditor.document;
    // console.log("Just typed:"+justTyped)

    if (justTyped == "()" || justTyped == "=") { // user is trying to do math
        console.log("Entering '( or ='");
        // let's convert the previous sentence with chrono.js and mathjs
        // get wordrange at position filters out spaces
        const endPos = pos;
        var startPos = new vscode.Position(endPos.line, endPos.character - 1);
        var queryString = "te";
        var startChar = startPos.character
        var spacePadded = false
        var stopChars=/[.\n?!:\-]/

        // while (!queryString.includes(stopChars) && (startPos.character != 0)) {
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

        var result = chrono.parseDate(queryString)
        var formattedResult = moment(result).format('MMM Do YYYY, h:mm a')

        if (formattedResult == "Invalid date") {
            console.log("Invalid date")
            // try mathjs?
            var mathResult = math.format(math.eval(queryString), {notation: 'fixed', precision: 2}).toLocaleString()
            console.log("math result: "+mathResult)
            formattedResult = format(mathResult)
        }

        var insertPos = new vscode.Position(pos.line, pos.character+1)
        if(spacePadded){formattedResult = " " + formattedResult}
        insertAndSelectStringAtPos(insertPos, formattedResult)
    }





    // if (justTyped == "=") {
    //     console.log("entering = mode")
    //     const range = doc.getWordRangeAtPosition(pos, /([\(\)-+\/*0-9\.\,]+)=/);
    //     console.log("Range is " + range);
    //     const word = doc.getText(range);
    //     const curPos = vscode.window.activeTextEditor.selection.active;
    //     const insertPos = new vscode.Position(curPos.line, curPos.character + 1);
    //     if (word.split(" ").length == 1) {
    //         const mathProblem = word.replace("=", "");
    //         console.log("math probem is " + mathProblem);
    //         var mathSolve = "" + eval("" + mathProblem); // TODO: use mathjs here, and also allow spaces using the technique from the '(' mode above 
    //         mathSolve = format(parseFloat(mathSolve)).toString(); // add thousand delimiter and only get two decimals            
    //         insertAndSelectStringAtPos(insertPos, mathSolve)
    //     }
    // }



}

function insertAndSelectStringAtPos(insertPos, str){
            vscode.window.activeTextEditor.edit(builder => {
                builder.insert(insertPos, str);
            });
            vscode.window.activeTextEditor.selection = new vscode.Selection(
                    insertPos, 
                    new vscode.Position(insertPos.line, insertPos.character + str.length + 1));    
}


function registerCompletions(){

        	vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("time", vscode.CompletionItemKind.Text)
            ci.insertText = "" + moment().format("h:mm a")
            return [ci]
        }
    });

        	vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("date", vscode.CompletionItemKind.Text)
            ci.insertText = "" + moment().format("MMMM Do YYYY")
            return [ci]
        }
    });

        	vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems() {
            var ci = new vscode.CompletionItem("datetime", vscode.CompletionItemKind.Text)
            ci.insertText = "" + moment().format("MMMM Do YYYY h:mm a")
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
          });
          // return an array with all available currencies
          return Object.keys(data.rates).concat(data.base);
        });
  }


exports.deactivate = deactivate;