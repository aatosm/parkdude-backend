import * as slackService from '../services/slack.service';

import * as request from 'supertest';
import {ParkingSpot} from '../entities/parking-spot';
import {closeConnection} from '../test-utils/teardown';
import {TEST_USER_EMAIL, loginWithEmail, createAppWithNormalSession} from '../test-utils/test-login';
import {User, UserRole} from '../entities/user';
import {DayReservation} from '../entities/day-reservation';
import {DayRelease} from '../entities/day-release';
import {disableErrorLogs, enableErrorLogs} from '../test-utils/logger';
import {toDateString} from '../utils/date';

describe('Parking reservations (e2e)', () => {
  let agent: request.SuperTest<request.Test>;
  let parkingSpots: ParkingSpot[];
  let user: User;
  let user2: User;
  let adminUser: User;
  const slackMessageSpy = jest.spyOn(slackService, 'sendSlackMessage');

  beforeEach(async () => {
    agent = await createAppWithNormalSession();
    parkingSpots = await Promise.all([
      ParkingSpot.create({name: 'test space 0'}).save(),
      ParkingSpot.create({name: 'test space 1'}).save(),
      ParkingSpot.create({name: 'test space 2'}).save()
    ]);
    user = await User.findOneOrFail({email: TEST_USER_EMAIL});
    user2 = await User.create({
      name: 'Tester 2',
      email: 'tester2@example.com',
      role: UserRole.VERIFIED}
    ).save();
    adminUser = await User.create({
      name: 'Admin Tester',
      email: 'admin@example.com',
      role: UserRole.ADMIN
    }).save();
    slackMessageSpy.mockClear();
  });

  afterEach(async () => {
    await DayReservation.delete({});
    await DayRelease.delete({});
    await ParkingSpot.delete({});
    await User.delete({});
  });

  afterAll(async () => {
    await closeConnection();
  });

  describe('GET /api/parking-reservations/calendar', () => {
    test('Should return dates in a small date range', async () => {
      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-05')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2019-11-03',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2019-11-04',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2019-11-05',
              spacesReservedByUser: [],
              availableSpaces: 3
            }
          ],
          ownedSpots: []
        });
    });

    test('Should return specific date', async () => {
      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-01')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 3
            }
          ],
          ownedSpots: []
        });
    });

    test('Should return dates in small date range between months', async () => {
      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-12-30&endDate=2020-01-02')
        .expect(200, {
          calendar: [
            {
              date: '2019-12-30',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2019-12-31',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2020-01-01',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2020-01-02',
              spacesReservedByUser: [],
              availableSpaces: 3
            }
          ],
          ownedSpots: []
        });
    });

    test('Should show permanent spaces reserved by user', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-02')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData(),
                parkingSpots[1].toBasicParkingSpotData()
              ],
              availableSpaces: 1
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData(),
                parkingSpots[1].toBasicParkingSpotData()
              ],
              availableSpaces: 1
            }
          ],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData(),
            parkingSpots[1].toBasicParkingSpotData()
          ]
        });
    });

    test('Should show normal reservations', async () => {
      await DayReservation.create({
        user,
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-02')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData()
              ],
              availableSpaces: 2
            }
          ],
          ownedSpots: []
        });
    });

    test('Should not show released owned spots as reserved', async () => {
      parkingSpots[0].owner = user;
      await parkingSpots[0].save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-02')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [parkingSpots[0].toBasicParkingSpotData()],
              availableSpaces: 2
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 3
            }
          ],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData()
          ]
        });
    });

    test('Should show other user\'s released spots as free', async () => {
      parkingSpots[0].owner = user2;
      await parkingSpots[0].save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-02')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 2
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 3
            }
          ],
          ownedSpots: []
        });
    });

    test('Should work with owned, reserved and released spaces', async () => {
      parkingSpots[0].owner = user;
      await parkingSpots[0].save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-03'
      }).save();

      await DayReservation.create({
        user,
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();

      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-03')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData()
              ],
              availableSpaces: 2
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 3
            },
            {
              date: '2019-11-03',
              spacesReservedByUser: [
                parkingSpots[1].toBasicParkingSpotData()
              ],
              availableSpaces: 2
            }
          ],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData()
          ]
        });
    });

    test('Should not show other reservations as free', async () => {
      parkingSpots[0].owner = user2;
      await parkingSpots[0].save();

      await DayReservation.create({
        user: user2,
        spot: parkingSpots[1],
        date: '2019-11-02'
      }).save();

      await agent
        .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-11-02')
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 2
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 1
            }
          ],
          ownedSpots: []
        });
    });

    describe('Error handling', () => {
      beforeAll(() => {
        disableErrorLogs();
      });

      afterAll(() => {
        enableErrorLogs();
      });

      test('Should fail with 400 if startDate is missing', async () => {
        await agent
          .get('/api/parking-reservations/calendar?endDate=2019-11-02')
          .expect(400, {message: 'startDate and endDate are required.'});
      });

      test('Should fail with 400 if endDate is missing', async () => {
        await agent
          .get('/api/parking-reservations/calendar?startDate=2019-11-01')
          .expect(400, {message: 'startDate and endDate are required.'});
      });

      test('Should fail with 400 if startDate and endDate are missing', async () => {
        await agent
          .get('/api/parking-reservations/calendar')
          .expect(400, {message: 'startDate and endDate are required.'});
      });


      test('Should fail with 400 if date is invalid', async () => {
        await agent
          .get('/api/parking-reservations/calendar?startDate=2019-13-01&endDate=2019-11-02')
          .expect(400, {message: 'Date must be valid.'});
      });

      test('Should fail with 400 if endDate is before startDate', async () => {
        await agent
          .get('/api/parking-reservations/calendar?startDate=2019-11-01&endDate=2019-10-02')
          .expect(400, {message: 'Start date must be after end date.'});
      });


      test('Should fail with 400 if date range is over 500 days', async () => {
        await agent
          .get('/api/parking-reservations/calendar?startDate=2019-01-01&endDate=2021-01-01')
          .expect(400, {message: 'Date range is too long (over 500 days).'});
      });
    });
  });

  describe('GET /api/parking-reservations/parking-spot/:parkingSpotId/calendar', () => {
    test('Should return dates in a small date range (no reservations)', async () => {
      await agent
        .get(
          `/api/parking-reservations/parking-spot/${parkingSpots[0].id}/calendar` +
         '?startDate=2019-11-01&endDate=2019-11-05'
        )
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 1
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 1
            },
            {
              date: '2019-11-03',
              spacesReservedByUser: [],
              availableSpaces: 1
            },
            {
              date: '2019-11-04',
              spacesReservedByUser: [],
              availableSpaces: 1
            },
            {
              date: '2019-11-05',
              spacesReservedByUser: [],
              availableSpaces: 1
            }
          ],
          ownedSpots: []
        });
    });

    test('Should show permanent spaces reserved by user', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await agent
        .get(
          `/api/parking-reservations/parking-spot/${parkingSpots[2].id}/calendar` +
          '?startDate=2019-11-01&endDate=2019-11-02'
        )
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData(),
                parkingSpots[1].toBasicParkingSpotData()
              ],
              availableSpaces: 1
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData(),
                parkingSpots[1].toBasicParkingSpotData()
              ],
              availableSpaces: 1
            }
          ],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData(),
            parkingSpots[1].toBasicParkingSpotData()
          ]
        });
    });

    test('Should show permanent space as unavailable', async () => {
      parkingSpots[0].owner = user;
      await parkingSpots[0].save();

      await agent
        .get(
          `/api/parking-reservations/parking-spot/${parkingSpots[0].id}/calendar` +
          '?startDate=2019-11-01&endDate=2019-11-02'
        )
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData()
              ],
              availableSpaces: 0
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData()
              ],
              availableSpaces: 0
            }
          ],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData()
          ]
        });
    });

    test('Should show permanent space reserved by others as unavailable', async () => {
      parkingSpots[0].owner = user2;
      await parkingSpots[0].save();

      await agent
        .get(
          `/api/parking-reservations/parking-spot/${parkingSpots[0].id}/calendar` +
          '?startDate=2019-11-01&endDate=2019-11-02'
        )
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 0
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 0
            }
          ],
          ownedSpots: []
        });
    });

    test('Should show reservations', async () => {
      await DayReservation.create({
        user,
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();
      await agent
        .get(
          `/api/parking-reservations/parking-spot/${parkingSpots[0].id}/calendar` +
          '?startDate=2019-11-01&endDate=2019-11-02'
        )
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 1
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [
                parkingSpots[0].toBasicParkingSpotData()
              ],
              availableSpaces: 0
            }
          ],
          ownedSpots: []
        });
    });

    test('Should not include reservations for other parking spots in available spaces', async () => {
      await DayReservation.create({
        user,
        spot: parkingSpots[1],
        date: '2019-11-02'
      }).save();
      await agent
        .get(
          `/api/parking-reservations/parking-spot/${parkingSpots[0].id}/calendar` +
         '?startDate=2019-11-01&endDate=2019-11-02'
        )
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [],
              availableSpaces: 1
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [parkingSpots[1].toBasicParkingSpotData()],
              availableSpaces: 1
            }
          ],
          ownedSpots: []
        });
    });

    test('Should not show released owned spots as reserved', async () => {
      parkingSpots[0].owner = user;
      await parkingSpots[0].save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await agent
        .get(
          `/api/parking-reservations/parking-spot/${parkingSpots[0].id}/calendar` +
         '?startDate=2019-11-01&endDate=2019-11-02'
        )
        .expect(200, {
          calendar: [
            {
              date: '2019-11-01',
              spacesReservedByUser: [parkingSpots[0].toBasicParkingSpotData()],
              availableSpaces: 0
            },
            {
              date: '2019-11-02',
              spacesReservedByUser: [],
              availableSpaces: 1
            }
          ],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData()
          ]
        });
    });
  });

  describe('GET /api/parking-reservations/my-reservations', () => {
    test('Should get reservations, releases and parking spots', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[2],
        date: '2019-11-02'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-04'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-05'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-04'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-05'
      }).save();

      await agent.get('/api/parking-reservations/my-reservations?startDate=2019-11-02&endDate=2019-11-05')
        .expect(200, {
          reservations: [{
            date: '2019-11-02',
            parkingSpot: parkingSpots[2].toBasicParkingSpotData()
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }],
          releases: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            reservation: null
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            reservation: {
              user: user.toUserData()
            }
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: null
          }],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData(),
            parkingSpots[1].toBasicParkingSpotData()
          ]
        });
    });

    test('Should not show past reservations', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[2],
        date: '2019-10-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-10-03'
      }).save();

      await agent.get('/api/parking-reservations/my-reservations?startDate=2019-11-02&endDate=2019-11-03')
        .expect(200, {
          reservations: [],
          releases: [],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData(),
            parkingSpots[1].toBasicParkingSpotData()
          ]
        });
    });

    test('Should not show another user\'s reservations or spots', async () => {
      parkingSpots[0].owner = user2;
      parkingSpots[1].owner = user2;
      await Promise.all([parkingSpots[0].save(), parkingSpots[1].save()]);

      await DayReservation.create({
        user: user2,
        spot: parkingSpots[2],
        date: '2019-11-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();

      await agent.get('/api/parking-reservations/my-reservations?startDate=2019-11-02&endDate=2019-11-03')
        .expect(200, {
          reservations: [],
          releases: [],
          ownedSpots: []
        });
    });

    test('startDate should default to current day', async () => {
      const currentDate = new Date();
      const previousDate = new Date();
      previousDate.setDate(previousDate.getDate() - 1);

      // Should not be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: toDateString(previousDate)
      }).save();

      // Should be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: toDateString(currentDate)
      }).save();

      await agent.get(`/api/parking-reservations/my-reservations?endDate=${toDateString(currentDate)}`)
        .expect(200, {
          reservations: [{
            date: toDateString(currentDate),
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }],
          releases: [],
          ownedSpots: []
        });
    });

    test('Reservations should be ordered by date', async () => {
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-01'
      }).save();

      await agent.get('/api/parking-reservations/my-reservations?startDate=2019-11-01&endDate=2019-11-03')
        .expect(200, {
          reservations: [{
            date: '2019-11-01',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }, {
            date: '2019-11-02',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData()
          }],
          releases: [],
          ownedSpots: []
        });
    });
  });

  describe('GET /api/users/:userId/reservations', () => {
    beforeEach(async () => {
      await loginWithEmail(agent, adminUser.email);
    });

    test('Should get reservations, releases and parking spots', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[2],
        date: '2019-11-02'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-04'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-05'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-04'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-05'
      }).save();

      await agent.get(`/api/users/${user.id}/reservations?startDate=2019-11-02&endDate=2019-11-05`)
        .expect(200, {
          reservations: [{
            date: '2019-11-02',
            parkingSpot: parkingSpots[2].toBasicParkingSpotData()
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }],
          releases: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            reservation: null
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            reservation: {
              user: user.toUserData()
            }
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: null
          }],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData(),
            parkingSpots[1].toBasicParkingSpotData()
          ]
        });
    });

    test('Should not show past reservations', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[2],
        date: '2019-10-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-10-03'
      }).save();

      await agent.get(`/api/users/${user.id}/reservations?startDate=2019-11-02&endDate=2019-11-03`)
        .expect(200, {
          reservations: [],
          releases: [],
          ownedSpots: [
            parkingSpots[0].toBasicParkingSpotData(),
            parkingSpots[1].toBasicParkingSpotData()
          ]
        });
    });

    test('Should not show wrong user\'s reservations or spots', async () => {
      parkingSpots[0].owner = user2;
      parkingSpots[1].owner = user2;
      await Promise.all([parkingSpots[0].save(), parkingSpots[1].save()]);

      await DayReservation.create({
        user: user2,
        spot: parkingSpots[2],
        date: '2019-11-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();

      await agent.get(`/api/users/${user.id}/reservations?startDate=2019-11-02&endDate=2019-11-03`)
        .expect(200, {
          reservations: [],
          releases: [],
          ownedSpots: []
        });
    });

    test('startDate should default to current day', async () => {
      const currentDate = new Date();
      const previousDate = new Date();
      previousDate.setDate(previousDate.getDate() - 1);

      // Should not be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: toDateString(previousDate)
      }).save();

      // Should be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: toDateString(currentDate)
      }).save();

      await agent.get(`/api/users/${user.id}/reservations?endDate=${toDateString(currentDate)}`)
        .expect(200, {
          reservations: [{
            date: toDateString(currentDate),
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }],
          releases: [],
          ownedSpots: []
        });
    });

    test('Reservations should be ordered by date', async () => {
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-01'
      }).save();

      await agent.get(`/api/users/${user.id}/reservations?startDate=2019-11-01&endDate=2019-11-03`)
        .expect(200, {
          reservations: [{
            date: '2019-11-01',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData()
          }, {
            date: '2019-11-02',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData()
          }],
          releases: [],
          ownedSpots: []
        });
    });
  });

  describe('GET /api/parking-reservations', () => {
    beforeEach(async () => {
      await loginWithEmail(agent, adminUser.email);
    });

    test('Should get reservations and releases', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[2],
        date: '2019-11-02'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-04'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-05'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-04'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-05'
      }).save();

      await agent.get(`/api/parking-reservations?startDate=2019-11-02&endDate=2019-11-05`)
        .expect(200, {
          reservations: [{
            date: '2019-11-02',
            parkingSpot: parkingSpots[2].toBasicParkingSpotData(),
            user: user.toUserData()
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            user: user.toUserData()
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            reservation: null
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            reservation: {
              user: user.toUserData()
            }
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: null
          }]
        });
    });

    test('Should not show past reservations', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user;
      await parkingSpots[0].save();
      await parkingSpots[1].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[2],
        date: '2019-10-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-10-03'
      }).save();

      await agent.get(`/api/parking-reservations?startDate=2019-11-02&endDate=2019-11-03`)
        .expect(200, {
          reservations: [],
          releases: []
        });
    });

    test('Should show reservations of multiple users', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user2;
      await Promise.all([parkingSpots[0].save(), parkingSpots[1].save()]);

      await DayReservation.create({
        user: user,
        spot: parkingSpots[2],
        date: '2019-11-03'
      }).save();
      await DayReservation.create({
        user: user2,
        spot: parkingSpots[2],
        date: '2019-11-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();

      await agent.get(`/api/parking-reservations?startDate=2019-11-02&endDate=2019-11-03`)
        .expect(200, {
          reservations: [{
            date: '2019-11-02',
            parkingSpot: parkingSpots[2].toBasicParkingSpotData(),
            user: user2.toUserData()
          }, {
            date: '2019-11-03',
            parkingSpot: parkingSpots[2].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            reservation: null
          }]
        });
    });

    test('startDate should default to current day', async () => {
      const currentDate = new Date();
      const previousDate = new Date();
      previousDate.setDate(previousDate.getDate() - 1);

      // Should not be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: toDateString(previousDate)
      }).save();

      // Should be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: toDateString(currentDate)
      }).save();

      await agent.get(`/api/parking-reservations?endDate=${toDateString(currentDate)}`)
        .expect(200, {
          reservations: [{
            date: toDateString(currentDate),
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: []
        });
    });

    test('Reservations should be ordered by date', async () => {
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[1],
        date: '2019-11-01'
      }).save();

      await agent.get(`/api/parking-reservations?startDate=2019-11-01&endDate=2019-11-03`)
        .expect(200, {
          reservations: [{
            date: '2019-11-01',
            parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
            user: user.toUserData()
          }, {
            date: '2019-11-02',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: []
        });
    });
  });

  describe('GET /api/parking-spots/:spotId/reservations', () => {
    beforeEach(async () => {
      await loginWithEmail(agent, adminUser.email);
    });

    test('Should get reservations and releases', async () => {
      parkingSpots[0].owner = user;
      await parkingSpots[0].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-04'
      }).save();
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-05'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-03'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-04'
      }).save();
      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-05'
      }).save();

      await agent.get(`/api/parking-spots/${parkingSpots[0].id}/reservations?startDate=2019-11-02&endDate=2019-11-05`)
        .expect(200, {
          reservations: [{
            date: '2019-11-02',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: null
          }, {
            date: '2019-11-04',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: {
              user: user.toUserData()
            }
          }, {
            date: '2019-11-05',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: {
              user: user.toUserData()
            }
          }]
        });
    });

    test('Should not show past reservations', async () => {
      parkingSpots[0].owner = user;
      await parkingSpots[0].save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-10-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-10-03'
      }).save();

      await agent.get(`/api/parking-spots/${parkingSpots[0].id}/reservations?startDate=2019-11-02&endDate=2019-11-03`)
        .expect(200, {
          reservations: [],
          releases: []
        });
    });

    test('Should not show reservations of other spots', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user2;
      await Promise.all([parkingSpots[0].save(), parkingSpots[1].save()]);

      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-03'
      }).save();
      await DayReservation.create({
        user: user2,
        spot: parkingSpots[1],
        date: '2019-11-02'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[1],
        date: '2019-11-03'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-04'
      }).save();

      await agent.get(`/api/parking-spots/${parkingSpots[0].id}/reservations?startDate=2019-11-02&endDate=2019-11-04`)
        .expect(200, {
          reservations: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: [{
            date: '2019-11-04',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: null
          }]
        });
    });

    test('Should show release-reservation relation when both are on same day', async () => {
      parkingSpots[0].owner = user;
      parkingSpots[1].owner = user2;
      await Promise.all([parkingSpots[0].save(), parkingSpots[1].save()]);

      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-03'
      }).save();

      await DayRelease.create({
        spot: parkingSpots[0],
        date: '2019-11-03'
      }).save();

      await agent.get(`/api/parking-spots/${parkingSpots[0].id}/reservations?startDate=2019-11-02&endDate=2019-11-03`)
        .expect(200, {
          reservations: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: [{
            date: '2019-11-03',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            reservation: {
              user: user.toUserData()
            }
          }]
        });
    });

    test('startDate should default to current day', async () => {
      const currentDate = new Date();
      const previousDate = new Date();
      previousDate.setDate(previousDate.getDate() - 1);

      // Should not be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: toDateString(previousDate)
      }).save();

      // Should be in results
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: toDateString(currentDate)
      }).save();

      await agent.get(`/api/parking-spots/${parkingSpots[0].id}/reservations?endDate=${toDateString(currentDate)}`)
        .expect(200, {
          reservations: [{
            date: toDateString(currentDate),
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: []
        });
    });

    test('Reservations should be ordered by date', async () => {
      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-02'
      }).save();

      await DayReservation.create({
        user: user,
        spot: parkingSpots[0],
        date: '2019-11-01'
      }).save();

      await agent.get(`/api/parking-spots/${parkingSpots[0].id}/reservations?startDate=2019-11-01&endDate=2019-11-03`)
        .expect(200, {
          reservations: [{
            date: '2019-11-01',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }, {
            date: '2019-11-02',
            parkingSpot: parkingSpots[0].toBasicParkingSpotData(),
            user: user.toUserData()
          }],
          releases: []
        });
    });
  });

  describe('POST /api/parking-reservations', () => {
    describe('Regular spots', () => {
      test('Should reserve specific spot for user for specific day', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            releases: [],
            ownedSpots: []
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019'
          ]
        ]);
      });

      test('Should reserve specific spot for user for multiple days', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-03'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-03',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-03',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            releases: [],
            ownedSpots: []
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019 - 03.11.2019'
          ]
        ]);
      });

      test('Should reserve from different spots if same is not available (spot not specified)', async () => {
        // Reserve some spots
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200);
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-03'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200);
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-02', '2019-11-03'],
            parkingSpotId: parkingSpots[2].id
          })
          .expect(200);

        // Each day should have different spot, since no others are available
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-03']
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-03',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 0: 01.11.2019 - 02.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019\n' +
            '• Parking spot test space 1: 03.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 2: 02.11.2019 - 03.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 2: 01.11.2019\n' +
            '• Parking spot test space 1: 02.11.2019\n' +
            '• Parking spot test space 0: 03.11.2019'
          ]
        ]);
      });

      test('Should reserve same spot if available when spot is not specified', async () => {
        // Reserve some spots
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200);
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-03'],
            parkingSpotId: parkingSpots[2].id
          })
          .expect(200);

        // Spots 0 and 2 are not available for all days, so spot 1 should be selected
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-03']
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-03',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 0: 01.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 2: 03.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019 - 03.11.2019'
          ]
        ]);
      });

      test('Should reserve spots in order of availability', async () => {
      // Spot 0 is least available
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-03', '2019-11-05'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200);
        // Spot 1 is second most available
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-04', '2019-11-07'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200);
        // Spot 2 is most available
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-04', '2019-11-06'],
            parkingSpotId: parkingSpots[2].id
          })
          .expect(200);

        // Preference order: 2 -> 1 -> 0
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-03', '2019-11-04', '2019-11-05', '2019-11-06', '2019-11-07']
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }, {
              date: '2019-11-03',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }, {
              date: '2019-11-04',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }, {
              date: '2019-11-05',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }, {
              date: '2019-11-06',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-07',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 0: 01.11.2019 - 03.11.2019\n' +
            '• Parking spot test space 0: 05.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019\n' +
            '• Parking spot test space 1: 04.11.2019\n' +
            '• Parking spot test space 1: 07.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 2: 04.11.2019\n' +
            '• Parking spot test space 2: 06.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 2: 01.11.2019 - 03.11.2019\n' +
            '• Parking spot test space 0: 04.11.2019\n' +
            '• Parking spot test space 2: 05.11.2019\n' +
            '• Parking spot test space 1: 06.11.2019\n' +
            '• Parking spot test space 2: 07.11.2019'
          ],
        ]);
      });

      test('Should reserve spot that is reserved for another day', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200);
        // Reserve for different day
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-02'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200);
      });
    });

    describe('Owned spots', () => {
      test('Should not be able to reserve spot owned by user', async () => {
        parkingSpots[0].owner = user;
        await parkingSpots[0].save();

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(400, {
            errorDates: ['2019-11-01'],
            message: 'Reservation failed. There weren\'t available spots for some of the days.'
          });
      });

      test('Should be able to reserve a released spot', async () => {
        parkingSpots[0].owner = user2;
        await parkingSpots[0].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 0: 01.11.2019'
          ]
        ]);
      });

      test('Should not be able to reserve owned spot released on different day', async () => {
        parkingSpots[0].owner = user2;
        await parkingSpots[0].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-02'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(400, {
            errorDates: ['2019-11-02'],
            message: 'Reservation failed. There weren\'t available spots for some of the days.'
          });
      });

      test('Should be able to reserve owned spot which has been reserved after release', async () => {
        parkingSpots[0].owner = user2;
        await parkingSpots[0].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();

        // Reserve released
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        // Reservation again fails
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(400, {
            errorDates: ['2019-11-01'],
            message: 'Reservation failed. There weren\'t available spots for some of the days.'
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 0: 01.11.2019'
          ]
        ]);
      });

      test('Should be able to reserve released owned spots and non-owned spots', async () => {
        parkingSpots[0].owner = user2;
        parkingSpots[1].owner = user2;
        await parkingSpots[0].save();
        await parkingSpots[1].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();
        // Prepare: Reserve remaining non-owned spot for a day
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[2].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        // Should reserve from owned and non-owned spot
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02']
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[2].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 2: 01.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 0: 01.11.2019\n' +
            '• Parking spot test space 2: 02.11.2019'
          ]
        ]);
      });

      test('Should handle multiple separate date ranges in Slack notifications', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-04', '2019-11-05'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-04',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-05',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019 - 02.11.2019\n' +
            '• Parking spot test space 1: 04.11.2019 - 05.11.2019'
          ]
        ]);
      });
    });

    describe('Reserving own releases', () => {
      test('Should remove own release', async () => {
        parkingSpots[0].owner = user;
        await parkingSpots[0].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();

        expect(await DayRelease.count()).toBe(1);

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(await DayRelease.count()).toBe(0);
        expect(await DayReservation.count()).toBe(0);
      });

      test('Should remove own releases', async () => {
        parkingSpots[0].owner = user;
        await parkingSpots[0].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();
        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-02'
        }).save();

        expect(await DayRelease.count()).toBe(2);
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(await DayRelease.count()).toBe(0);
        expect(await DayReservation.count()).toBe(0);
      });

      test('Should remove own release when reserving random spot', async () => {
        parkingSpots[0].owner = user;
        parkingSpots[1].owner = user2;
        parkingSpots[2].owner = user2;
        await parkingSpots[0].save();
        await parkingSpots[1].save();
        await parkingSpots[2].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();

        expect(await DayRelease.count()).toBe(1);

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01']
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(await DayRelease.count()).toBe(0);
        expect(await DayReservation.count()).toBe(0);
      });

      test('Should reserve normally and remove release', async () => {
        parkingSpots[0].owner = user;
        parkingSpots[1].owner = user2;
        parkingSpots[2].owner = user2;
        await parkingSpots[0].save();
        await parkingSpots[1].save();
        await parkingSpots[2].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();
        await DayRelease.create({
          spot: parkingSpots[1],
          date: '2019-11-02'
        }).save();

        expect(await DayRelease.count()).toBe(2);

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02']
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(await DayRelease.count()).toBe(1);
        expect(await DayReservation.count()).toBe(1);
      });

      test('Should not remove own release if it is reserved', async () => {
        parkingSpots[0].owner = user;
        await parkingSpots[0].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();
        await DayReservation.create({
          spot: parkingSpots[0],
          date: '2019-11-01',
          user: user2
        }).save();

        expect(await DayRelease.count()).toBe(1);

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(400, {
            errorDates: ['2019-11-01'],
            message: 'Reservation failed. There weren\'t available spots for some of the days.'
          });
        expect(await DayRelease.count()).toBe(1);
        expect(await DayReservation.count()).toBe(1);
      });

      test('Should not remove own releases from other days', async () => {
        parkingSpots[0].owner = user;
        await parkingSpots[0].save();

        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-01'
        }).save();
        await DayRelease.create({
          spot: parkingSpots[0],
          date: '2019-11-02'
        }).save();

        expect(await DayRelease.count()).toBe(2);

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[0].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[0].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        expect(await DayRelease.count()).toBe(1);
        expect(await DayReservation.count()).toBe(0);
      });
    });

    describe('Reservation failure handling', () => {
      test('Should fail to reserve same spot twice', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(400, {
            errorDates: ['2019-11-01'],
            message: 'Reservation failed. There weren\'t available spots for some of the days.'
          });
      });

      test('Should fail to reserve same spot twice even when some days are available', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(400, {
            errorDates: ['2019-11-01'],
            message: 'Reservation failed. There weren\'t available spots for some of the days.'
          });
      });
    });

    describe('Input and permission error handling', () => {
      beforeAll(() => {
        disableErrorLogs();
      });

      afterAll(() => {
        enableErrorLogs();
      });

      test('Should give 403 if non-admin tries to reserve for other user', async () => {
        await loginWithEmail(agent, user2.email);
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[1].id,
            userId: user.id
          })
          .expect(403, {message: 'Permission denied.'});
      });

      test('Should give 400 if dates is invalid', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            parkingSpotId: parkingSpots[1].id
          })
          .expect(400, {message: 'dates is required.'});
        await agent.post('/api/parking-reservations')
          .send({
            dates: [],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(400, {message: 'dates is required.'});
        await agent.post('/api/parking-reservations')
          .send({
            dates: '2019-11-01',
            parkingSpotId: parkingSpots[1].id
          })
          .expect(400, {message: 'dates is required.'});
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01T12:00'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(400, {message: 'Dates must be in format YYYY-MM-DD.'});
      });

      test('Should give 404 if parking spot does not exist', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: '5e744477-c573-4856-9947-ec2500c7c0e2'
          })
          .expect(404, {message: 'Parking spot does not exist. It might have been removed.'});
      });
    });
  });

  describe('DELETE /api/parking-spot/:parkingSpotId', () => {
    describe('Normal reservations', () => {
      test('Should remove normal reservation', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(200, {message: 'Parking reservations successfully released.'});

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [],
            releases: [],
            ownedSpots: []
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019'
          ],
          [
            'Parking spot test space 1 released for reservation:\n' +
            '• 01.11.2019'
          ]
        ]);
      });

      test('Should not remove reservations from other days', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-03'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-03',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01,2019-11-03`)
          .expect(200, {message: 'Parking reservations successfully released.'});

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [{
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            releases: [],
            ownedSpots: []
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019 - 03.11.2019'
          ],
          [
            'Parking spot test space 1 released for reservation:\n' +
            '• 01.11.2019\n' +
            '• 03.11.2019'
          ]
        ]);
      });

      test('Should not remove reservations from other users', async () => {
        await DayReservation.create({
          user: user2,
          spot: parkingSpots[1],
          date: '2019-11-01'
        }).save();

        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(400, {
            message: 'Parking spot does not have reservation, and cannot be released.',
            errorDates: ['2019-11-01']
          });


        await loginWithEmail(agent, user2.email);

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            releases: [],
            ownedSpots: []
          });
      });

      test('Should remove reservations from other users with admin role', async () => {
        await DayReservation.create({
          user: user2,
          spot: parkingSpots[1],
          date: '2019-11-01'
        }).save();

        user.role = UserRole.ADMIN;
        await user.save();

        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(200, {message: 'Parking reservations successfully released.'});

        await loginWithEmail(agent, user2.email);

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [],
            releases: [],
            ownedSpots: []
          });
      });

      test('Should give error when there is no reservation', async () => {
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01,2019-11-02`)
          .expect(400, {
            message: 'Parking spot does not have reservation, and cannot be released.',
            errorDates: ['2019-11-01', '2019-11-02']
          });
      });

      test('Should handle multiple separate date ranges in Slack notifications', async () => {
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01', '2019-11-02', '2019-11-04', '2019-11-05'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-04',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }, {
              date: '2019-11-05',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        await agent.delete(
          `/api/parking-reservations/parking-spot/${parkingSpots[1].id}` +
          '?dates=2019-11-01,2019-11-02,2019-11-04,2019-11-05'
        )
          .expect(200, {message: 'Parking reservations successfully released.'});
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019 - 02.11.2019\n' +
            '• Parking spot test space 1: 04.11.2019 - 05.11.2019'
          ],
          [
            'Parking spot test space 1 released for reservation:\n' +
            '• 01.11.2019 - 02.11.2019\n' +
            '• 04.11.2019 - 05.11.2019'
          ]
        ]);
      });
    });

    describe('Owned parking spots', () => {
      test('Should release owned spots', async () => {
        parkingSpots[1].owner = user;
        await parkingSpots[1].save();
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(200, {message: 'Parking reservations successfully released.'});

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [],
            releases: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
              reservation: null
            }],
            ownedSpots: [
              parkingSpots[1].toBasicParkingSpotData()
            ]
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Parking spot test space 1 released for reservation:\n' +
            '• 01.11.2019'
          ]
        ]);
      });

      test('Should release multiple owned spots', async () => {
        parkingSpots[1].owner = user;
        await parkingSpots[1].save();
        await agent.delete(
          `/api/parking-reservations/parking-spot/${parkingSpots[1].id}?` +
          'dates=2019-11-05,2019-11-01,2019-11-02,2019-11-03,2019-11-30'
        )
          .expect(200, {message: 'Parking reservations successfully released.'});

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [],
            releases: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
              reservation: null
            }, {
              date: '2019-11-02',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
              reservation: null
            }, {
              date: '2019-11-03',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
              reservation: null
            }, {
              date: '2019-11-05',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
              reservation: null
            }, {
              date: '2019-11-30',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
              reservation: null
            }],
            ownedSpots: [
              parkingSpots[1].toBasicParkingSpotData()
            ]
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Parking spot test space 1 released for reservation:\n' +
            '• 01.11.2019 - 03.11.2019\n' +
            '• 05.11.2019\n' +
            '• 30.11.2019'
          ]
        ]);
      });

      test('Should not release another user\'s owned spots', async () => {
        parkingSpots[1].owner = user2;
        await parkingSpots[1].save();
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(400, {
            message: 'Parking spot does not have reservation, and cannot be released.',
            errorDates: ['2019-11-01']
          });

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [],
            releases: [],
            ownedSpots: []
          });
      });

      test('Should release another user\'s owned spot with admin role', async () => {
        parkingSpots[1].owner = user2;
        await parkingSpots[1].save();

        user.role = UserRole.ADMIN;
        await user.save();

        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(200, {message: 'Parking reservations successfully released.'});

        await loginWithEmail(agent, user2.email);

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [],
            releases: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData(),
              reservation: null
            }],
            ownedSpots: [
              parkingSpots[1].toBasicParkingSpotData()
            ]
          });
      });


      test('Should delete reservation on released spot', async () => {
        parkingSpots[1].owner = user2;
        await parkingSpots[1].save();

        await loginWithEmail(agent, user2.email);

        // Create release
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(200, {message: 'Parking reservations successfully released.'});

        await loginWithEmail(agent, user.email);

        // Reserve
        await agent.post('/api/parking-reservations')
          .send({
            dates: ['2019-11-01'],
            parkingSpotId: parkingSpots[1].id
          })
          .expect(200, {
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            message: 'Spots successfully reserved'
          });

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [{
              date: '2019-11-01',
              parkingSpot: parkingSpots[1].toBasicParkingSpotData()
            }],
            releases: [],
            ownedSpots: []
          });

        // Remove reservation
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=2019-11-01`)
          .expect(200, {message: 'Parking reservations successfully released.'});

        await agent.get('/api/parking-reservations/my-reservations?startDate=2019-01-01&endDate=2019-12-31')
          .expect({
            reservations: [],
            releases: [],
            ownedSpots: []
          });
        expect(slackMessageSpy.mock.calls).toEqual([
          [
            'Parking spot test space 1 released for reservation:\n' +
            '• 01.11.2019'
          ],
          [
            'Reservations made by Tester:\n' +
            '• Parking spot test space 1: 01.11.2019'
          ],
          [
            'Parking spot test space 1 released for reservation:\n' +
            '• 01.11.2019'
          ]
        ]);
      });
    });

    describe('General error handling', () => {
      beforeAll(() => {
        disableErrorLogs();
      });

      afterAll(() => {
        enableErrorLogs();
      });

      test('Should give 400 if dates is missing', async () => {
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}`)
          .expect(400, {message: 'dates is required.'});
      });

      test('Should give 400 if date is invalid', async () => {
        await agent.delete(`/api/parking-reservations/parking-spot/${parkingSpots[1].id}?dates=abc,efg`)
          .expect(400, {message: 'Dates must be in format YYYY-MM-DD.'});
      });

      test('Should give 404 if parking spot does not exist', async () => {
        await agent.delete(
          '/api/parking-reservations/parking-spot/5e744477-c573-4856-9947-ec2500c7c0e2?dates=2019-11-01'
        )
          .expect(404, {message: 'Parking spot does not exist. It might have been removed.'});
      });
    });
  });
});
