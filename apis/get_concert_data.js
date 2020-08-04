const moment = require("moment");
const { graphql } = require('graphql');
const { API, graphqlOperation, Amplify } = require("aws-amplify")
const { awsmobile } = require("./AppSync");

//why put this here instead of in queries file?
//requiring the query removes a graphql required header
//importing keeps the header, but doesn't work with node js due to how modules work
//so this must go here!
const list_concerts = `query listConcerts(
$filter: TableConcertFilterInput
) {
listConcerts(filter: $filter, limit: 1000) {
  items {
    id
    poster_url
    stub_url
    location
    date
    time
    is_live
    artist_id
    concert_name
    general_price
  }
}
}`;

Amplify.configure(awsmobile);

const getMostRecentUpcomingInfo = async () => {
  // Calling the API, using async and await is necessary
  const info = await API.graphql(
    graphqlOperation(list_concerts, {
      filter: { is_future: { eq: true }, is_confirmed: { eq: true } },
    })
  );

  const info_list = info.data.listConcerts.items; // Stores the items in database
  info_list.sort((a, b) =>
    moment(a.date + "T" + a.time).diff(moment(b.date + "T" + b.time))
  );

  return info_list[0];
};

module.exports = { getMostRecentUpcomingInfo };
