export interface TrafficPoint{

    label: string,
    rps: number

}

export interface TrafficProfile{

    points: TrafficPoint[]

}

export const DEFAULT_PERIOD_DAYS = 31;

function buildProfile(days: number, rpsForDay: (dayIndex: number) => number): TrafficProfile{

    const points: TrafficPoint[] = [];

    for(let day = 0; day < days; day++){
        points.push({ label: `Day ${day + 1}`, rps: Math.max(0, roundToOneDecimal(rpsForDay(day))) });
    }

    return { points };

}

function roundToOneDecimal(value: number): number{
    return Math.round(value * 10) / 10;
}

export function createFlatProfile(days: number, rps: number): TrafficProfile{

    return buildProfile(days, () => rps);

}

export function createRampProfile(days: number, startRps: number, endRps: number): TrafficProfile{

    return buildProfile(days, (day) => startRps + (endRps - startRps) * (day / Math.max(1, days - 1)));

}

export function createWeeklyCycleProfile(days: number, baselineRps: number, weekendMultiplier: number): TrafficProfile{

    return buildProfile(days, (day) => {

        const isWeekend = day % 7 === 5 || day % 7 === 6;
        return baselineRps * (isWeekend ? weekendMultiplier : 1);

    });

}

// Illustrative online-shop shape: steady baseline most of the period, with a
// bell-shaped ramp up to and back down from a single peak day (e.g. Christmas
// Eve for a December profile). Symmetric, not a realistic retail curve
// (real Christmas traffic falls off faster than it ramps up) - good enough
// for "what does a spike do to cost/capacity", which is the point here.
export function createSpikeProfile(days: number, baselineRps: number, peakRps: number, peakDayIndex: number): TrafficProfile{

    return buildProfile(days, (day) => {

        const rampWidthDays = Math.max(1, Math.floor(days / 4));
        const distanceFromPeak = Math.abs(day - peakDayIndex);

        if(distanceFromPeak >= rampWidthDays){
            return baselineRps;
        }

        const closeness = 1 - (distanceFromPeak / rampWidthDays);
        return baselineRps + (peakRps - baselineRps) * Math.pow(closeness, 2);

    });

}

export function averageRps(profile: TrafficProfile): number{

    if(profile.points.length === 0){
        return 0;
    }

    const total = profile.points.reduce((sum, point) => sum + point.rps, 0);
    return total / profile.points.length;

}

export function peakPoint(profile: TrafficProfile): TrafficPoint | null{

    return profile.points.reduce((peak: TrafficPoint | null, point) =>
        (peak == null || point.rps > peak.rps) ? point : peak
    , null);

}
