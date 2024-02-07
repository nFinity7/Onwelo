
// // Dane wejściowe
const authorsAndTitles = [
    // { author: "Agatha Christie", title: "The Mysterious Affair at Styles" },
    { author: "Agatha Christie", title: "The Secret Adversary" },
    // { author: "Agatha Christie", title: "And Then There Were None" },
    // { author: "Agatha Christie", title: "Murder on the Orient Express" },
    // { author: "Agatha Christie", title: "The Murder of Roger Ackroyd" },
    // { author: "Agatha Christie", title: "Death on the Nile" }
];

const fetch = require('node-fetch');
const { Client } = require('pg');

// Konfiguracja klienta PostgreSQL
const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'ebook_prices',
    password: '123456',
    port: 5432,
});

// Funkcja pobierająca ceny ebooków z API iTune Search
async function fetchEbookPrices(authorsAndTitles) {
    const ebookPrices = [];
    for (const { author, title } of authorsAndTitles) {
        try {
            const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(author)}+${encodeURIComponent(title)}&entity=ebook`);
            const data = await response.json();
            const ebook = data.results[0];
            if (ebook) {
                ebookPrices.push({
                    name: author,
                    title: title,
                    curr: ebook.currency,
                    price: ebook.price,
                    date: ebook.releaseDate.substring(0, 10) // Wyciągamy tylko datę
                });
            }
        } catch (error) {
            console.error(`Error fetching ebook price for ${author}: ${title}`, error);
        }
    }
    return ebookPrices;
}

// Funkcja pobierająca kursy walut z API NBP dla określonej daty
async function fetchExchangeRate(date) {
    try {
        const response = await fetch(`https://api.nbp.pl/api/exchangerates/tables/A/${date}/?format=json`);
        const data = await response.json();
        const tableNo = data[0].no;
        const usdRate = data[0].rates.find(rate => rate.code === 'USD').mid;
        return { rate: usdRate, tableNo: tableNo };
    } catch (error) {
        console.error(`Error fetching exchange rates for ${date}`, error);
        return null;
    }
}

// Funkcja obliczająca cenę ebooka w PLN na podstawie kursu waluty
function calculatePriceInPLN(ebook, usdRate) {
    const pricePLN = ebook.price * usdRate;
    return pricePLN.toFixed(2); // Zaokrąglamy do dwóch miejsc po przecinku
}

// Funkcja zapisująca dane do bazy danych PostgreSQL
async function saveToDatabase(ebooks) {
    try {
        await client.connect();
        for (const ebook of ebooks) {
            const { name, title, curr, price, date, fromNBP } = ebook;
            const query = `
                INSERT INTO ebook_prices (author, title, currency, price, release_date, usd_exchange_rate, pln_price, nbp_table_no)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            const values = [name, title, curr, price, date, fromNBP.rate, fromNBP.pricePLN, fromNBP.tableNo];
            await client.query(query, values);
        }
        console.log('Data successfully saved to PostgreSQL database.');
    } catch (error) {
        console.error('Error saving data to PostgreSQL database:', error);
    } finally {
        await client.end();
    }
}

async function main() {
    const ebookPrices = await fetchEbookPrices(authorsAndTitles);

    const ebooksInPLN = [];
    for (const ebook of ebookPrices) {
        const { rate, tableNo } = await fetchExchangeRate(ebook.date);
        if (rate !== null) {
            const pricePLN = calculatePriceInPLN(ebook, rate);
            ebooksInPLN.push({
                ...ebook,
                fromNBP: {
                    rate: rate,
                    pricePLN: pricePLN,
                    tableNo: tableNo
                }
            });
        }
    }

    console.log(ebooksInPLN);

    await saveToDatabase(ebooksInPLN);
}

main();
