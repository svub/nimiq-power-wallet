import '@nimiq/style/nimiq-style.min.css';
import '@nimiq/vue-components/dist/NimiqVueComponents.css';

import { Component, Vue } from 'vue-property-decorator';
import { Wallet, BasicTransaction, ExtendedTransaction } from '@nimiq/core-web';
import { NetworkClient } from '@nimiq/network-client';
import { ValidationUtils } from '@nimiq/utils';
import parseCsv from 'csv-parse/lib/sync';
import { loadNimiqCryptography } from './lib/CoreLoader';

type Nimiq = typeof import('@nimiq/core-web');

export type TxData = {
    address: string,
    value: number,
    id: number,
}

let nimiq: Nimiq;

@Component({ components: {} })
export default class App extends Vue {
    Nimiq: any;
    client?: NetworkClient;
    wallet?: Wallet;
    address = '';
    balance = 0;
    loaded = false;
    height = 0;
    txData: TxData[] = [];
    showAddTxs = false;
    showAddViaCvs = true;
    nimValues = true;
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

            this.client = NetworkClient.hasInstance()
                ? NetworkClient.Instance
                : NetworkClient.createInstance('https://network.nimiq.com');
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

            console.log('loaded.');
            this.loaded = true;
        }
    }

    addTx() {
        const address = prompt('paste address') || '';
        const value = parseFloat(prompt('TX value', '0') || '0');
        this.txData.push({ address, value, id: this.txData.length });
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
                this.txData.push({ address, value, id: this.txData.length });
            }
        }
        this.showAddTxs = false;
    }

    testCsv() {
        const parsed = JSON.stringify(this.parseCsv());
        (this.$refs.addViaCsvTest as HTMLDivElement).textContent = parsed;
    }

    addViaCsv() {
        this.txData = this.parseCsv();
        const [tx] = this.txData;
        this.createExtendedTransaction(tx.address, tx.value, 'test message');
        this.showAddViaCvs = false;
    }

    parseCsv(): TxData[] {
        const csv = (this.$refs.addViaCsv as HTMLTextAreaElement).value.trim();
        const csvData: any[][] = parseCsv(csv, {
            cast: true,
            // eslint-disable-next-line
            cast_date: false,
            delimiter: '\t',
        });
        console.warn(csvData);
        if (csvData.length < 1) return [];

        // understand column order
        const first = csvData[0];
        const valueIndex = first.findIndex((cell) => ValidationUtils.isValidAddress(cell));
        const parseNum = (str: string): number => Number.parseFloat(`${str}`.replace(/,/g, ''));
        if (valueIndex < 0) throw new Error('Address not found');
        // const valueIndex = first.findIndex((cell) => parseInt(cell, 10) ValidationUtils.isValidAddress(cell));
        const amountIndex = first.findIndex((cell) => !Number.isNaN(parseNum(cell)));
        if (amountIndex < 0) throw new Error('Amount not found');

        return csvData.map((row, id) => ({ address: row[valueIndex], value: parseNum(row[amountIndex]), id }));
    }

    async sendAll() {
        this.receipts = (await Promise.all(this.txs.map((tx) => tx ? this.sendTransaction(tx) : null)))
            .map((hash) => (hash ? `https://nimiq.watch/#${hash}` : ''));
    }

    valid(address: string) {
        return ValidationUtils.isValidAddress(address);
    }

    converted(value: number) {
        return this.nimValues ? value * this.usdRate : Math.ceil(value / this.usdRate);
    }

    get total() {
        return this.txs.reduce((total, tx) => total + (tx ? tx.value + tx.fee : 0), 0) / 100000;
    }

    get fees() {
        return this.txs.reduce((total, tx) => total + (tx ? tx.fee : 0), 0) / 100000;
    }

    get txs(): (BasicTransaction | ExtendedTransaction | null)[] {
        return this.txData.map((tx) => this.createTransaction(
            tx.address,
            this.nimValues ? tx.value : tx.value / this.usdRate,
            this.message,
        ));
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
            this.autoSend = false;
            this.sendAll();
        }
    }

    async sendTransaction(transaction: BasicTransaction | ExtendedTransaction): Promise<string> {
        // Send to the Nimiq network
        console.log('plain TX', transaction.toPlain());
        const result = (await this.client!.sendTransaction(transaction.toPlain()));
        console.log('hash', result.transactionHash);
        return result.transactionHash;
    }

    createTransaction(address: string, amount: number, message: string) {
        // validate input data
        if ((amount <= 0) // spreadsheets might have lines via amount=0... just ignore.
            || (!address || address.trim().length === 0) // ignore lines with empty addresses
            || (!this.valid(address))) return null; // add warning for invalid addresses

        // create an extended transaction if the message is not empty
        return message.trim().length > 0
            ? this.createExtendedTransaction(address, amount, message)
            : this.createBasicTransaction(address, amount);
    }

    // helper function to create the basic transaction used in tutorial 3
    createBasicTransaction(address: string, amount: number): BasicTransaction {
        const { wallet, client } = this;
        console.log('basic TX', address, amount, 0, client!.headInfo.height);
        return wallet!.createTransaction(
            nimiq.Address.fromUserFriendlyAddress(address),
            nimiq.Policy.coinsToLunas(amount),
            138, // fee
            client!.headInfo.height,
        );
    }

    // create an extended transaction that will carry the message as "extraData"
    createExtendedTransaction(address: string, amount: number, message: string): ExtendedTransaction {
        const { wallet, client } = this;
        // turn string into a safely encoded list of bytes
        const extraData = nimiq.BufferUtils.fromUtf8(message);

        function create(fee = 0) {
            return new nimiq.ExtendedTransaction(
                wallet!.address,
                nimiq.Account.Type.BASIC,
                nimiq.Address.fromUserFriendlyAddress(address),
                nimiq.Account.Type.BASIC,
                nimiq.Policy.coinsToLunas(amount),
                fee,
                client!.headInfo.height,
                nimiq.Transaction.Flag.NONE,
                extraData,
            );
        }
        const fee = create().serialize().length * 2;
        const transaction = create(fee);

        // sign transaction with key pair from our wallet
        const { publicKey, privateKey } = wallet!.keyPair;
        const signature = nimiq.Signature.create(privateKey, publicKey, transaction.serializeContent());
        const proof = nimiq.SignatureProof.singleSig(publicKey, signature);
        transaction.proof = proof.serialize();

        console.log('extended TX', address, amount, 0, client!.headInfo.height, transaction);
        return transaction;
    }
}
