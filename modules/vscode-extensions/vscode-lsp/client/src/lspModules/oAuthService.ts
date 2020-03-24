/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * This class is to Create a node server to get authorization_code and get acess token using that.
 * ------------------------------------------------------------------------------------------ */
import * as express from "express";
import { Server } from "http";
import * as vscode from 'vscode';
import * as path from 'path';
const keytar = require('keytar');
const axios = require('axios');
import {ServiceTree} from './serviceTree';
import { FileHandler } from './fileHandler';

import {ScriptLibraryTree} from './scriptLibraryTree';

// Object of the FileHandler.
const fileHandler = new FileHandler();

export class Wso2OAuth {
	public app: express.Express;
	public server: Server;

	constructor(public port: number) {
		this.app = express();
		this.app.use(express.json(), express.urlencoded({ extended: false }));
	}

	public async StartProcess(context) {

		this.server = this.app.listen(this.port);
		this.app.get("/oauth", async (req, res) => {
			
			try {
				// Get client ID from the extension configuartions.
				var clientID = vscode.workspace.getConfiguration().get('IAM.ServiceClientID');
				var clientSecret;

				// Get the client secret from the system key chain.
				var secret = keytar.getPassword("clientSecret", "clientSecret");
				await secret.then((result) => {
					clientSecret = result; // Assign the value to client secret					
				});

				// String created to encode from base64.
				let data = String(clientID) + ':' + String(clientSecret);
				let buff = new Buffer(data);

				// Base64 Encoding
				let base64data = buff.toString('base64');
				const requestToken = req.query.code;

				// Get the url of the wso2 IS.
				var url = vscode.workspace.getConfiguration().get('IAM.URL');

				// To bypass the self signed server error.
				process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

				// Make a post request to get the acess token from wso2 IS.
				axios({

					method: 'post',
					url: url + `/oauth2/token?grant_type=authorization_code&code=${requestToken}&redirect_uri=http://localhost:8010/oauth`,

					// Set the content type header, so that we get the response in JSOn
					headers: {
						Authorization: 'Basic ' + base64data,
						accept: 'application/json'
					}
				}).then(async (response) => {
					// Once we get the response, extract the access token from
					// the response body

					// Add the Password to the keychain
					keytar.setPassword("acessToken", "acessToken", String(response.data.access_token));

					// Close the webview.
					await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

					// To create the service providers tree view.
					vscode.window.createTreeView('service-providers', {
						treeDataProvider: new ServiceTree()
					});

					// To create the script libraries tree view.
					vscode.window.createTreeView('script-libraries',{
						treeDataProvider: new ScriptLibraryTree()			
					});
					
					// Show the sucess message in the vscode.
					vscode.window.showInformationMessage("Successfully Configued your Extension");

					//html path to oauthsuccess.html
					var htmlFilePath = vscode.Uri.file(
						path.join( context.extensionPath,'client', 'src', 'ui', 'oauthsuccess.html')
					);
					var html = fileHandler.getHTMLCode(htmlFilePath.fsPath);
					res.send(html);

				}).catch((err) => {
					// Do somthing
					console.log(err);

					// Show the sucess message in the vscode.
					vscode.window.showErrorMessage("Recheck Your ClientID and client Secret");

					//html path to oauthfailed.html
					var htmlFilePath = vscode.Uri.file(
						path.join( context.extensionPath,'client', 'src', 'ui', 'oauthfailed.html')
					);
					var html = fileHandler.getHTMLCode(htmlFilePath.fsPath);
					res.send(html);
				});				

				// Close the server.		
				this.server.close();				

			} catch (err) {
				const error = new Error(err);
				console.log(error);
			}
		});
	}
}
