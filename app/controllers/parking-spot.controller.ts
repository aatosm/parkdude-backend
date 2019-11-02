import {Request, Response} from 'express';
import {
  fetchParkingSpots, createParkingSpot,
  updateParkingSpot, fetchParkingspot
} from '../services/parking-spot.service';
import {
  PostParkingSpotResponse, PostUpdatedParkingSpotResponse,
  GetParkingspotsResponse, ParkingSpotBody
} from '../interfaces/parking-spot.interfaces';
import {GenericResponse} from '../interfaces/general.interfaces';
import {GetParkingspotResponse} from '../interfaces/parking-spot.interfaces';

export async function getParkingSpots(req: Request, res: Response) {
  const parkingSpots = await fetchParkingSpots();
  const json: GetParkingspotsResponse = {
    data: parkingSpots.map((spot) => spot.toParkingSpotData())
  };
  res.status(200).json(json);
}

// TODO: Tests and validation

export async function getParkingSpot(req: Request, res: Response) {
  const parkingSpot = await fetchParkingspot(req.params.spotId);
  const json: GetParkingspotResponse = {
    data: parkingSpot.toParkingSpotData()
  };
  res.status(200).json(json);
}

export async function postParkingSpot(req: Request, res: Response) {
  const data: ParkingSpotBody = req.body;
  const parkingSpot = await createParkingSpot(data);
  const json: PostParkingSpotResponse = {
    message: 'Parking spot successfully created.',
    data: parkingSpot.toParkingSpotData()
  };
  res.status(201).json(json);
}

export async function postUpdatedParkingSpot(req: Request, res: Response) {
  const data: ParkingSpotBody = req.body;
  const parkingSpot = await updateParkingSpot(req.params.id, data);
  const json: PostUpdatedParkingSpotResponse = {
    message: 'Parking spot successfully updated.',
    data: parkingSpot.toParkingSpotData()
  };
  res.status(200).json(json);
}

export async function deleteParkingspot(req: Request, res: Response) {
  const json: GenericResponse = {
    message: 'Parking spot successfully deleted.'
  };
  // TODO: Implement
  res.status(200).json(json);
}
