const { paginateResults } = require("./utils");
const { GraphQLScalarType } = require('graphql');
const { PubSub } = require('apollo-server');
const pubSub = new PubSub();
const TRIP_BOOKED = 'TRIP_BOOKED';

module.exports = {
  Result: {
    __resolveType(obj, context, info) {
      if(obj.name) {
        return 'Team'
      }
      if(obj.type) {
        return 'Rocket'
      }
    }
  },



  Query: {
    search: (_, { contains }) => { debugger; return [{ type: 'Falcon 9'}]; },

    launches: async (_, { pageSize = 20, after }, { dataSources }) => {
      const allLaunches = await dataSources.launchAPI.getAllLaunches();
      // we want these in reverse chronological order
      allLaunches.reverse();

      const launches = paginateResults({
        after,
        pageSize,
        results: allLaunches
      });
      return {
        launches,
        cursor: launches.length ? launches[launches.length - 1].cursor : null,
        hasMore: launches.length
          ? launches[launches.length - 1].cursor !=
            allLaunches[allLaunches.length - 1].cursor
          : false
      };
    },

    favoriteRocket: () => 'Falcon Heavy',
    pickFavoriteRocket: (parent, args) => {
      return args.rocket;
    },

    launch: (_, { id }, { dataSources }) =>
      dataSources.launchAPI.getLaunchById({ launchId: id }),
    me: (_, __, { dataSources }) => dataSources.userAPI.findOrCreateUser()
  },

  Subscription: {
    bookedTrip: {
      subscribe: () => pubSub.asyncIterator([TRIP_BOOKED]),
    }
  },

  Mutation: {
    login: async (_, { email }, { dataSources }) => {
      const user = await dataSources.userAPI.findOrCreateUser({ email });
      if (user) return Buffer.from(email).toString("base64");
    },
    bookTrips: async (_, { launchIds }, { dataSources }) => {
      const results = await dataSources.userAPI.bookTrips({ launchIds });
      const launches = await dataSources.launchAPI.getLaunchesByIds({
        launchIds,
      });

      const combinedResults = {
        success: results && results.length === launchIds.length,
        message:
          results.length === launchIds.length
            ? 'trips booked successfully'
            : `the following launches couldn't be booked: ${launchIds.filter(
                id => !results.includes(id),
              )}`,
        launches,
      };

      pubSub.publish(TRIP_BOOKED, { bookedTrip: combinedResults })

      return combinedResults;
    },
    cancelTrip: async (_, { launchId }, { dataSources }) => {
      const result = await dataSources.userAPI.cancelTrip({ launchId });
  
      if (!result)
        return {
          success: false,
          message: 'failed to cancel trip',
        };
  
      const launch = await dataSources.launchAPI.getLaunchById({ launchId });
      return {
        success: true,
        message: 'trip cancelled',
        launches: [launch],
      };
    },
  },
  Launch: {
    isBooked: async (launch, _, { dataSources }) =>
      dataSources.userAPI.isBookedOnLaunch({ launchId: launch.id })
  },

  // https://www.apollographql.com/docs/apollo-server/features/scalars-enums/
  Date: new GraphQLScalarType ({
    name: 'Date',
    parseValue(value) { // value from the client
      debugger;
    },
    serialize(value) { // value sent to the client
      debugger;
      return value.created;
    },
    parseLiteral(ast) {
      debugger;
    }
  }),

  User: {
    trips: async (_, __, { dataSources }) => {
      // get ids of launches by user
      const launchIds = await dataSources.userAPI.getLaunchIdsByUser();

      if (!launchIds.length) return [];

      // look up those launches by their ids
      return (
        dataSources.launchAPI.getLaunchesByIds({
          launchIds
        }) || []
      );
    }
  }
};
