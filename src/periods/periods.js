import schedule from "./schedule.json";
import extendedSchedule from "./extendedSchedule.json";

const timestamps = schedule.map((period) => {
  return [timeToMs(period[0]), timeToMs(period[1])];
});

const extendedTimestamps = extendedSchedule.map((period) => {
  return [timeToMs(period[0]), timeToMs(period[1])];
});

// Returns zero-indexed period
export function getPeriod(date = Date.now()) {
  const period = timestamps.findIndex((periods) => {
    return date >= periods[0] && date < periods[1];
  });
  return period;
}

// Returns zero-indexed period time range
export function getPeriodRange(date = Date.now(), period) {
  const range = period ? timestamps[period - 1] : timestamps.find((periods) => {
    return date >= periods[0] && date < periods[1];
  });
  return range;
}

// Returns zero-indexed extended period
export function getExtendedPeriod(date = Date.now()) {
  const period = extendedTimestamps.findIndex((periods) => {
    return date >= periods[0] && date < periods[1];
  });
  return period;
}

// Returns zero-indexed extended period time range
export function getExtendedPeriodRange(date = Date.now(), period) {
  const range = period ? extendedTimestamps[period - 1] : extendedTimestamps.find((periods) => {
    return date >= periods[0] && date < periods[1];
  });
  return range;
}

// Converts hh:mm to milliseconds
export function timeToMs(time) {
  const now = new Date();
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).getTime();
}
