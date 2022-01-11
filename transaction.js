if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const { MongoClient } = require('mongodb');

async function main() {
    const uri = process.env.DB_URI;

    const client = new MongoClient(uri);

    try {
        // Connect to the MongoDB cluster
        await client.connect();

        // Make the appropriate DB calls
        await createReservation(client, 'frank97@example.com', 'Quan Nhau Cay Xoan', [new Date('2022-01-19'), new Date('2022-01-20')], { pricePerNight: 90, specialRequest: 'Phone chargers', breakfastIncluded: false });
        // console.log(createReservationDocument('Infinite Views', [new Date('2021-12-31'), new Date('2022-01-01')], { pricePerNight: 90, specialRequest: 'Phone chargers', breakfastIncluded: false }));

    } finally {
        // Close the connection to the MongoDB cluster
        await client.close();
    }
}

main().catch(console.error);

async function createReservation(client, userEmail, nameOfListing, reservationDates, reservationDetails) {
    const usersCollection = client.db('sample_airbnb').collection('users');
    const listingsAndReviewsCollection = client.db('sample_airbnb').collection('listingsAndReviews');

    const reservation = createReservationDocument(nameOfListing, reservationDates, reservationDetails);

    const session = client.startSession();

    const transactionOptions = {
        readPreference: 'primary',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority' }
    };

    try {
        const transactionResults = await session.withTransaction(async () => {
            const usersUpdateResults = await usersCollection.updateOne({ email: userEmail }, { $addToSet: { reservations: reservation } }, { session });

            console.log(`${usersUpdateResults.matchedCount} document(s) found in the users collection with the email address ${userEmail}`);
            console.log(`${usersUpdateResults.modifiedCount} document(s) was/were updated to include the reservation`);

            const isListingReservedResults = await listingsAndReviewsCollection.findOne({ name: nameOfListing, datesReserved: { $in: reservationDates } }, { session });

            if (isListingReservedResults) {
                await session.abortTransaction();
                console.error('This listing is already reserved for at least one of the given dates. The reservation could not be created.');
                console.error('Any operations that already occurred as part of this transaction will be rolled back.');
                return;
            }

            const listingsAndReviewsUpdateResults = await listingsAndReviewsCollection.updateOne({ name: nameOfListing }, { $addToSet: { datesReserved: reservationDates } }, { session });
            console.log(`${listingsAndReviewsUpdateResults.matchedCount} document(s) found in the listingsAndReviews collection with the name ${nameOfListing}.`);
            console.log(`${listingsAndReviewsUpdateResults.modifiedCount} document(s) was/were updated to include the reserevation dates.`);

        }, transactionOptions);

        if (transactionResults) {
            console.log('The reservation was successfully created.');
        } else {
            console.log('The transaction was intentionally aborted.');
        }

    } catch (e) {
        console.log('The transaction was aborted due to an unexpected error: ' + e);
    } finally {
        await session.endSession();
    }
}

function createReservationDocument(nameOfListing, reservationDates, reservationDetails) {
    let reservation = {
        name: nameOfListing,
        dates: reservationDates
    }

    for (let detail in reservationDetails) {
        reservation[detail] = reservationDetails[detail];
    }

    return reservation;
}