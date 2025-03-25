import BeastiesPlugin from 'beasties-webpack-plugin';
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin';
import UnoCSSPlugin from '@unocss/webpack';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Configuration as Config } from 'webpack';
import { resolve } from 'node:path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import ReplaceInFileWebpackPlugin from 'replace-in-file-webpack-plugin';
import fg from 'fast-glob';
import BrotliWasmWebpackPlugin from './brotliWasmWebpackPlugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';

import 'dotenv-flow/config';

const tsconfigRaw = JSON.parse(readFileSync('./tsconfig.json', 'utf-8'));

export default {
    entry: fg.sync(['./src/index.tsx', './src/models/**']),
    output: {
        path: resolve(__dirname, 'dist'),
        filename: '[name].js',
        sourceMapFilename: '[name].js.map',
        publicPath: '/',
    },
    resolve: {
        plugins: [
            new TsconfigPathsPlugin({ configFile: './tsconfig.json' })
        ],
        extensions: [
            '.ts',
            '.tsx',
            '.js',
            '.jsx',
            '.json',
            '.bin',
            '.gltf',
            '.txt',
            '.png',
            '.webp',
        ],
    },
    plugins: [
        new BeastiesPlugin(),
        UnoCSSPlugin({
            configFile: './unocss.config.ts',
        }),
        new HtmlWebpackPlugin({
            filename: 'index.html',
            templateContent: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Eaglercraft Client Collections</title>
                </head>
                <body 
                    class="bg-ctp-base text-ctp-text min-h-screen" 
                    data-commit-hash="__COMMIT_HASH__"
                    data-zip-url="__ZIP_FILE_URL__"
                >
                    <div id="root"></div>
                </body>
                </html>
            `,
        }),
        new MiniCssExtractPlugin({
            filename: '[name].css',
        }),
        new ReplaceInFileWebpackPlugin([
            {
                dir: 'dist',
                files: ['index.html'],
                rules: [
                    {
                        search: '__COMMIT_HASH__',
                        replace: (() => {
                            try {
                                return execSync('git rev-parse HEAD').toString().trim();
                            } catch (error) {
                                return 'unknown';
                            }
                        })(),
                    },
                    {
                        search: '__ZIP_FILE_URL__',
                        replace: (() => {
                            if (process.env.ZIP_FILE_URL) return process.env.ZIP_FILE_URL;
                            else return '/files.zip';
                        })(),
                    },
                ],
            },
        ]),
        new BrotliWasmWebpackPlugin({
            test: /\.(js|css|html|svg)$/,
            threshold: 1024,
            quality: 9,
            //addContentEncodingHeader: true
        }),
        (function() {
            if (!process.env.ZIP_FILE_URL)
                return new CopyWebpackPlugin({
                    patterns: [
                        { from: 'public', to: '.' },
                    ],
                });
            else return null;
        })(),
    ],
    module: {
        rules: [
            {
                test: /\.(tsx|ts)$/,
                use: [
                    {
                        loader: 'esbuild-loader',
                        options: {
                            tsconfigRaw,
                        },
                    },
                ],
            },
            {
                test: /\.(png|webp|gltf|txt|bin)$/,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            name: '[path][name].[ext]',
                            outputPath: (resourcePath: string, _: any) => {
                                return resourcePath.replace(/^src\//, 'assets/');
                            },
                            publicPath: '/assets/',
                            context: 'src/',
                        },
                    },
                ],
            },
            {
               test: /\.css$/,
               use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
               ],
            },
            {
                test: /\.html$/,
                use: [
                    {
                        loader: 'html-loader',
                    },
                ],
            },
        ],
    },
    optimization: {
          realContentHash: true,
    },
} as Config;
