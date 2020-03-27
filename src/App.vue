<template lang="pug">
    #app
        transition
            .loading(v-if='!loaded') Loading...
            .content(v-else)
                .balance Balance {{ balance }}
                .address {{ address }}
                .height Block height {{ height }} - next block expected in {{ countdown }} seconds
                .rate 1 NIM = {{ usdRate > 0 ? usdRate : '*loading*' }} USD
                hr
                .tx-list
                    .actions
                        input(type='radio' v-model='nimValues' :value='true' id='nimValues')
                        label(for='nimValues') NIM values
                        input(type='radio' v-model='nimValues' :value='false' id='usdValues')
                        label(for='usdValues')  USD values
                        | ---
                        button.add(@click='addTx') +
                        button.addMany(@click='showAddTxs = !showAddTxs') ++
                        .addMany(v-if='showAddTxs')
                            textarea.addresses(ref='addManyAddresses' placeholder='addresses separated by linebreaks')
                            input.value(ref='addManyValue' placeholder='value (opt)')
                            input.message(ref='addManyMessage' placeholder='message (opt)')
                            button.add(@click='addTxs') Add
                        | ---
                        input.message(v-model='message' placeholder='message')
                    .list
                        .emtpy(v-if='txs.length') add transactions clicking "+" or "++"
                        .tx(v-for="tx in txs" :key='tx.id')
                            input.address(v-model='tx.address' :class='{valid}')
                            | valid {{ valid(tx.address) }}
                            input.value(v-model.number='tx.value')
                            | {{ nimValues ? 'NIM' : 'USD' }}
                            .converted.nq-text {{ converted(tx.value) }} {{ nimValues ? 'USD' : 'NIM' }}
                    .status(v-if='txs.length > 0')
                        .total
                            | Total to send
                            | {{ nimValues ? `${total} NIM / ${total * usdRate} USD` : '' }}
                            | {{ !nimValues ? `${total} USD / ${Math.ceil(total / usdRate)} NIM` : '' }}
                        .sufficient Enough funds? {{ sufficient }}
                        button.send(@click='sendAll' :disabled='!sufficient') send
                    .receipts(v-if='receipts && receipts.length > 0')
                        textarea {{ receipts.join('\n') }}
</template>

<script lang="ts" src="./app.ts"></script>

<style lang="scss">
#app > * {
    margin-left: auto;
    margin-right: auto;
}
</style>
