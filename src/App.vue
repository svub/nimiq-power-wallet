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
                        input.message(v-model='message' placeholder='message')
                        | ---
                        button.add(@click='addTx') +
                        button.addMany(@click='showAddTxs = !showAddTxs') ++
                        .addMany(v-if='showAddTxs')
                            textarea.addresses(ref='addManyAddresses' placeholder='addresses separated by linebreaks')
                            input.value(ref='addManyValue' placeholder='value (opt)')
                            input.message(ref='addManyMessage' placeholder='message (opt)')
                            button.add(@click='addTxs') Add
                        button.addMany(@click='showAddViaCvs = !showAddViaCvs') CSV
                        .addMany(v-if='showAddViaCvs')
                            textarea.csv(ref='addViaCsv' placeholder='paste from spreadsheet' @input='testCsv')
                            .results(ref='addViaCsvTest')
                            button.add(@click='addViaCsv') Add
                    hr
                    .list
                        .emtpy(v-if='txData.length') add transactions by clicking "+", "++", or "csv"
                        .tx(v-for="tx in txData" :key='tx.id')
                            input.address(v-model='tx.address' :class='{valid}')
                            | valid {{ valid(tx.address) }}
                            input.value(v-model.number='tx.value')
                            | {{ nimValues ? 'NIM' : 'USD' }}
                            .converted.nq-text {{ converted(tx.value) }} {{ nimValues ? 'USD' : 'NIM' }}
                    hr
                    .status(v-if='txData.length > 0')
                        .total
                            | Total to send
                            | {{ nimValues ? `${total} NIM / ${total * usdRate} USD` : '' }}
                            | {{ !nimValues ? `${total} USD / ${Math.ceil(total / usdRate)} NIM` : '' }}
                            | including {{ fees }} NIM fees.
                        .sufficient Enough funds? {{ sufficient }}
                        button.send(@click='sendAll' :disabled='!sufficient') send
                        br
                        input(id='autoSend' type='checkbox' v-model='autoSend')
                        label(for='autoSend') Auto send when balance is sufficiant
                    hr
                    .receipts(v-if='receipts && receipts.length > 0')
                        textarea {{ receipts.join('\n') }}
</template>

<script lang="ts" src="./app.ts"></script>

<style lang="scss">
#app > * {
    margin-left: auto;
    margin-right: auto;
}

textarea {
    height: 8em;
    width: 30em;
}
</style>
