import '@nimiq/style/nimiq-style.min.css';
import '@nimiq/vue-components/dist/NimiqVueComponents.css';

import { Component, Vue } from 'vue-property-decorator';
import { NetworkClient } from '@nimiq/network-client';
import { ValidationUtils } from '@nimiq/utils';
import parseCsv from 'csv-parse/lib/sync';
import { loadNimiqCryptography } from './lib/CoreLoader';

type Nimiq = typeof import('@nimiq/core-web');

export type Tx = {
    address: string,
    value: number,
    id: number,
}

let nimiq: Nimiq;

@Component({ components: {} })
export default class App extends Vue {
    Nimiq: any;
    client?: NetworkClient;
    wallet: any;
    address = '';
    balance = 0;
    loaded = false;
    height = 0;
    txs: Tx[] = [];
    showAddTxs = false;
    showAddViaCvs = true;
    nimValues = false;
    usdRate = 0.0;
    countdown = 60;
    receipts: string[] = [];
    message = '';
    autoSend = false;

    async mounted() {
        if (!this.loaded) {
            console.log('loading');
            const ratePromise = fetch('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd');

            // [nimiq] = (await Promise.all([loadNimiqCore(), loadNimiqCryptography()]));
            nimiq = await loadNimiqCryptography();
            // gives a testnet endpoint if not running on nimiq.com - don't understand logic :(
            // this.client = NetworkClient.Instance;
            this.client = NetworkClient.createInstance('https://network.nimiq.com');
            await this.client.init();
            console.log(this.client);

            // Load or generate a wallet
            this.wallet = localStorage.wallet
                ? nimiq.Wallet.loadPlain(JSON.parse(localStorage.wallet))
                : nimiq.Wallet.generate();
            this.address = this.wallet.address.toUserFriendlyAddress();
            localStorage.wallet = JSON.stringify(Array.from(this.wallet.exportPlain()));

            this.client.on(NetworkClient.Events.HEAD_CHANGE, this.onHeadChanged);
            setInterval(() => this.countdown--, 1000);

            try {
                const response = (await (await ratePromise).json());
                console.log(response);
                this.usdRate = response['nimiq-2'].usd;
            } catch (error) {
                alert(`Failed to load NIM/USD rate. Reason: ${error}`);
            }
            // ratePromise
            //     .then(async (response) => this.usdRate = (await response.json())['nimiq-2'].usd)
            //     .catch((reason) => alert(`Failed to load NIM/USD rate. Reason: ${reason}`));

            console.log('loaded.');
            this.loaded = true;
        }
    }

    addTx() {
        const address = prompt('paste address') || '';
        const value = parseFloat(prompt('TX value', '0') || '0');
        this.txs.push({ address, value, id: this.txs.length });
    }

    addTxs() {
        const addresses = (this.$refs.addManyAddresses as HTMLTextAreaElement).value.trim();
        this.message = (this.$refs.addManyMessage as HTMLTextAreaElement).value.trim();
        if (addresses.length > 0) {
            console.log(addresses);
            console.log(addresses.split('\n'));
            const value = parseFloat((this.$refs.addManyValue as HTMLInputElement).value);
            for (const address of addresses.split('\n').map((a) => a.trim())) {
                console.log({ address, value });
                this.txs.push({ address, value, id: this.txs.length });
            }
        }
        this.showAddTxs = false;
    }

    testCsv() {
        const parsed = JSON.stringify(this.parseCsv());
        (this.$refs.addViaCsvTest as HTMLDivElement).textContent = parsed;
    }

    addViaCsv() {
        this.txs = this.parseCsv();
    }

    parseCsv(): Tx[] {
        this.showAddViaCvs = false;
        const csv = (this.$refs.addViaCsv as HTMLTextAreaElement).value.trim();
        const csvData: any[][] = parseCsv(csv, {
            cast: true,
            // eslint-disable-next-line
            cast_date: true,
            delimiter: '\t',
        });
        console.warn(csvData);
        if (csvData.length < 1) return [];

        // understand column order
        const first = csvData[0];
        const valueIndex = first.findIndex((cell) => ValidationUtils.isValidAddress(cell));
        if (valueIndex < 0) throw new Error('Address not found');
        // const valueIndex = first.findIndex((cell) => parseInt(cell, 10) ValidationUtils.isValidAddress(cell));
        const amountIndex = first.findIndex((cell) => Number.isInteger(cell));
        if (amountIndex < 0) throw new Error('Amount not found');

        return csvData.map((row, id) => ({ address: row[valueIndex], value: row[amountIndex], id }));
    }

    async sendAll() {
        this.receipts = await Promise.all(this.txs.map((tx) =>
            this.sendTransaction(tx.address, this.nimValues ? tx.value : tx.value / this.usdRate, this.message),
        ));
    }

    valid(address: string) {
        return ValidationUtils.isValidAddress(address);
    }

    converted(value: number) {
        return this.nimValues ? value * this.usdRate : Math.ceil(value / this.usdRate);
    }


    get total() {
        return this.txs.map((tx) => tx.value).reduce((total, value) => total + value, 0);
    }

    get sufficient() {
        const nim = this.nimValues ? this.total : this.total / this.usdRate;
        return nim <= this.balance;
    }

    // blockchain
    async onHeadChanged() {
        console.log('balance', await this.client!.getBalance(this.address));
        const balance = (await this.client!.getBalance(this.address)).get(this.address);
        this.balance = balance || 0;
        this.height = this.client!.headInfo.height;
        this.countdown = 60;

        if (this.autoSend && this.sufficient) {
            this.sendAll();
        }
    }

    async sendTransaction(address: string, amount: number, message: string): Promise<string> {
        const { wallet, client } = this;

        // helper function to create the basic transaction used in tutorial 3
        async function basicTransaction() {
            console.log('basic TX', address, amount, 0, client!.headInfo.height);
            return wallet.createTransaction(
                nimiq.Address.fromUserFriendlyAddress(address),
                nimiq.Policy.coinsToLunas(amount),
                0, // fee
                client!.headInfo.height,
            );
        }

        // create an extended transaction that will carry the message as "extraData"
        async function extendedTransaction() {
            // turn string into a safely encoded list of bytes
            const extraData = nimiq.BufferUtils.fromUtf8(message);

            const transaction = new nimiq.ExtendedTransaction(
                wallet.address,
                nimiq.Account.Type.BASIC,
                nimiq.Address.fromUserFriendlyAddress(address),
                nimiq.Account.Type.BASIC,
                nimiq.Policy.coinsToLunas(amount),
                0,
                client!.headInfo.height,
                nimiq.Transaction.Flag.NONE,
                extraData,
            );

            // sign transaction with key pair from our wallet
            const { publicKey, privateKey } = wallet.keyPair;
            const signature = nimiq.Signature.create(privateKey, publicKey, transaction.serializeContent());
            const proof = nimiq.SignatureProof.singleSig(publicKey, signature);
            transaction.proof = proof.serialize();

            console.log('extended TX', address, amount, 0, client!.headInfo.height, transaction);
            return transaction;
        }

        // create an extended transaction if the message is not empty
        const transaction = message.trim().length > 0
            ? await extendedTransaction()
            : await basicTransaction();

        // Send to the Nimiq network
        const result = (await client!.sendTransaction(transaction.toPlain()));
        return result.transactionHash;
    }
}
