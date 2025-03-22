import { compress } from 'brotli-wasm';
import { RawSource } from 'webpack-sources';
import { Buffer } from 'node:buffer';

export default class BrotliWasmWebpackPlugin {
    options: Partial<{
        test: RegExp;
        threshold: number;
        quality: number;
    }>;

    constructor(options = {}) {
        this.options = {
            test: /\.(js|css|html|svg)$/,
            threshold: 0,
            quality: 11,
            ...options,
        };
    }

    apply(compiler: any) {
        compiler.hooks.emit.tapPromise('BrotliWasmWebpackPlugin', async (compilation: any) => {
            const assets = compilation.assets;
            const promises = [];

            for (const filename in assets) {
                if (!this.options.test.test(filename)) continue;

                const asset = assets[filename];
                const content = asset.source();
                const size = asset.size();

                if (size < this.options.threshold) continue;

                promises.push(this.compressAsset(compilation, filename, content));
            }

            await Promise.all(promises);
            return;
        });
    }

    async compressAsset(compilation: any, filename: string, content: any) {
        try {
            const buffer = Buffer.isBuffer(content)
                ? content
                : Buffer.from(content);

            const compressed = compress(buffer, {
                quality: this.options.quality
            });

            const brFilename = `${filename}.br`;
            compilation.assets[brFilename] = new RawSource(Buffer.from(compressed).toString('utf8'));

            console.log(`Compressed ${filename} (${buffer.length} bytes) to ${brFilename} (${compressed.length} bytes)`);
        } catch (err) {
            compilation.errors.push(
                new Error(`BrotliWasmPlugin: Error compressing ${filename}: ${err.message}`)
            );
        }
    }
}