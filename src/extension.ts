import * as vscode from 'vscode';
import { create, insert, search } from '@orama/orama';
import * as path from 'path';

// @ts-ignore - Bypassing TS strictness for the Emscripten WASM module
const TreeSitterExports = require('web-tree-sitter');
const Parser = TreeSitterExports.Parser || TreeSitterExports.default || TreeSitterExports;

export function activate(context: vscode.ExtensionContext) {
    let extractor: any = null;
    let parser: any = null;

    const canonAgent = vscode.chat.createChatParticipant('context-canon.agent', async (request, chatContext, response, token) => {
        
        response.markdown(`You asked: **${request.prompt}**\n\n`);
        
        // 1. Initialize Heavy Engines (First run only)
        if (!extractor || !parser) {
            response.progress('Booting AI Engine & AST Parser...');
            
            // --- AI SETUP ---
            const { pipeline, env } = await import('@xenova/transformers');
            env.allowLocalModels = true;
            env.backends.onnx.wasm.numThreads = 1; 
            extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

            // --- AST SETUP ---
            response.progress('Loading Tree-sitter WASM...');
            const TreeSitterExports = await import('web-tree-sitter');
            const Parser: any = TreeSitterExports.Parser || TreeSitterExports.default || TreeSitterExports;
            const Language: any = Parser.Language || TreeSitterExports.Language;

            await Parser.init({
                locateFile(scriptName: string) {
                    return path.join(context.extensionPath, 'node_modules', 'web-tree-sitter', scriptName);
                }
            });
            
            parser = new Parser();
            const wasmPath = path.join(context.extensionPath, 'dist', 'tree-sitter-typescript.wasm');
            const Lang = await Language.load(wasmPath); 
            parser.setLanguage(Lang);
        }

        // 2. Grab the Active File from VS Code
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            response.markdown(`❌ Please open a TypeScript file in your editor first.`);
            return { metadata: { command: 'ast_test' } };
        }

        const sourceCode = editor.document.getText();
        const fileName = path.basename(editor.document.fileName);

        if (sourceCode.trim() === '') {
            response.markdown(`❌ The active file (\`${fileName}\`) is empty.`);
            return { metadata: { command: 'ast_test' } };
        }

        response.progress(`Parsing ${fileName} via AST...`);

        // 3. Create a fresh Vector DB for this file's current state
        const db = await create({ schema: { content: 'string', embedding: 'vector[384]' } });

        // 4. Parse the code into a navigable tree
        const tree = parser.parse(sourceCode);
        
        // 5. Extract Top-Level Functions & Exports
        const intelligentChunks: string[] = [];
        for (const node of tree.rootNode.children) {
            // Expanded to catch normal functions and variables, not just exports
            if (['export_statement', 'function_declaration', 'class_declaration', 'lexical_declaration'].includes(node.type)) {
               intelligentChunks.push(node.text);
            }
        }

        if (intelligentChunks.length === 0) {
             response.markdown(`⚠️ No functions or classes found in \`${fileName}\` to index.`);
             return { metadata: { command: 'ast_test' } };
        }

        response.progress(`Embedding ${intelligentChunks.length} AST nodes from ${fileName}...`);

        // 6. Embed each AST node into the Vector DB
        for (const chunk of intelligentChunks) {
            const output = await extractor(chunk, { pooling: 'mean', normalize: true });
            await insert(db, {
                content: chunk,
                embedding: output.tolist()[0]
            });
        }

        response.progress('Searching local Vector Index...');

        // 7. Query the database based on the user's prompt
        const promptOutput = await extractor(request.prompt, { pooling: 'mean', normalize: true });
        const promptVector = promptOutput.tolist()[0];

        const searchResults = await search(db, {
            mode: 'vector',
            vector: { value: promptVector, property: 'embedding' },
            similarity: 0.1, 
            limit: 1 
        });

        // 8. Return the perfectly isolated code block
        if (searchResults.hits.length > 0) {
            const bestMatch = searchResults.hits[0].document.content;
            const score = searchResults.hits[0].score;
            
            response.markdown(`**🎯 Isolated AST Node from \`${fileName}\` (Score: ${score.toFixed(2)}):**\n\n`);
            response.markdown(`\`\`\`typescript\n${bestMatch}\n\`\`\`\n\n`);
        } else {
            response.markdown(`❌ No relevant functions found in \`${fileName}\`.`);
        }

        return { metadata: { command: 'ast_test' } };
    });

    context.subscriptions.push(canonAgent);
}

export function deactivate() {}