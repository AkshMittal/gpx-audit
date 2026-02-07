/**
 * Sampling Audit Module
 * Observational audit pass for time sampling behavior in GPX points
 * Does NOT mutate, reorder, or normalize timestamps
 * Collects positive time deltas between consecutive valid timestamps
 * Also collects distance deltas using haversine formula
 */

/**
 * Calculates haversine distance between two points in meters
 * @param {number} lat1 - Latitude of first point in degrees
 * @param {number} lon1 - Longitude of first point in degrees
 * @param {number} lat2 - Latitude of second point in degrees
 * @param {number} lon2 - Longitude of second point in degrees
 * @returns {number} Distance in meters
 */

//IMPORTANT NOTE TO SELF: "Presence of timestamps enables time-conditioned distance audit; does NOT imply time-based sampling."
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Audits time sampling behavior by collecting positive time deltas
 * Also collects distance deltas between consecutive valid points
 * @param {Array} points - Array of point objects with timeRaw, lat, lon properties
 * @param {string} [gpxFilename] - Optional GPX filename (without extension) to include in download filenames
 * @returns {Object} Object containing time delta and distance delta statistics
 */
function auditSampling(points, gpxFilename) {
  // Global context logging
  // console.log('=== Sampling Audit - Global Context ===');
  // console.log('Total points received:', points.length);
  
  const timeDeltasMs = [];
  const distanceDeltasMTimeConditioned = [];
  const distanceDeltasMGeometryOnly = [];
  const timeDistancePairs = []; // Initialize early for result object
  let previousTimestampMs = null;
  let previousPoint = null; // Track previous point with valid coordinates
  let hasValidTimestamps = false; // Descriptive only: any parseable timestamp present
  let hasTimeProgression = false; // true iff at least one positive consecutive time delta (dt > 0)
  
  // First pass: determine if we have any valid (parseable) timestamps (descriptive only; does not gate collection)
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const timeRaw = point.timeRaw;
    if (timeRaw !== null) {
      const timestampMs = Date.parse(timeRaw);
      if (!isNaN(timestampMs)) {
        hasValidTimestamps = true;
        break;
      }
    }
  }
  
  // console.log('Has valid timestamps (presence):', hasValidTimestamps);
  // console.log('========================================');
  
  // Time delta audit counters
  let timestampedPointsCount = 0;
  let consecutiveTimestampPairsCount = 0;
  let positiveTimeDeltasCollected = 0;
  let rejectedTimestampPairsDeltaLeqZero = 0;
  
  // Collect flagged events
  const nonPositiveTimeDeltaEvents = [];
  
  // Distance delta audit counters (geometry-only mode)
  let consecutivePointPairsConsidered = 0;
  let rejectedDistanceInvalidOrZero = 0;
  
  let previousTimestampIndex = null;
  
  // Iterate through all points in order
  // Note: All points are assumed to have valid coordinates (validated during ingestion)
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const timeRaw = point.timeRaw;
    
    // Process timestamp for time delta calculation
    let currentTimestampMs = null;
    let hasValidTimestamp = false;
    
    if (timeRaw !== null) {
      currentTimestampMs = Date.parse(timeRaw);
      hasValidTimestamp = !isNaN(currentTimestampMs);
    }
    
    // Geometry-only distance: always compute for every consecutive valid coordinate pair (no timestamp dependency)
    if (previousPoint !== null) {
      consecutivePointPairsConsidered++;
      const distance = haversineDistance(
        previousPoint.lat,
        previousPoint.lon,
        point.lat,
        point.lon
      );
      if (isFinite(distance) && distance > 0) {
        distanceDeltasMGeometryOnly.push(distance);
      } else {
        rejectedDistanceInvalidOrZero++;
      }
    }
    
    // Time delta and time-conditioned distance: only when we have positive progression (dt > 0)
    if (hasValidTimestamp) {
      timestampedPointsCount++;
      
      if (previousTimestampMs !== null) {
        consecutiveTimestampPairsCount++;
        const delta = currentTimestampMs - previousTimestampMs;
        
        if (delta > 0) {
          positiveTimeDeltasCollected++;
          timeDeltasMs.push(delta);
          hasTimeProgression = true;
          
          // Time-conditioned distance delta for this pair only when dt > 0
          if (previousPoint !== null) {
            const distance = haversineDistance(
              previousPoint.lat,
              previousPoint.lon,
              point.lat,
              point.lon
            );
            if (isFinite(distance) && distance > 0) {
              distanceDeltasMTimeConditioned.push(distance);
            }
          }
        } else {
          rejectedTimestampPairsDeltaLeqZero++;
          nonPositiveTimeDeltaEvents.push({
            index: i,
            prevIndex: previousTimestampIndex,
            delta: delta
          });
        }
      }
      previousTimestampMs = currentTimestampMs;
      previousTimestampIndex = i;
    }
    
    // Update previous point (coordinates are already validated during ingestion)
    previousPoint = { lat: point.lat, lon: point.lon };
  }
  
  if (hasValidTimestamps && !hasTimeProgression) {
    // console.log('Timestamps detected but show no positive progression; time-based analysis disabled.');
  }
  
  // Time delta audit summary
  // console.log('=== Time Delta Audit ===');
  // console.log('Timestamped points:', timestampedPointsCount);
  // console.log('Timestamped consecutive pairs:', consecutiveTimestampPairsCount);
  // console.log('Positive deltas collected:', positiveTimeDeltasCollected);
  // console.log('Rejected (delta <= 0):', rejectedTimestampPairsDeltaLeqZero);
  // console.log('========================');
  
  // Primary distance series for charts/exports: time-conditioned when progression exists, else geometry-only
  const distanceDeltasM = hasTimeProgression ? distanceDeltasMTimeConditioned : distanceDeltasMGeometryOnly;
  
  // Distance delta audit summary
  if (hasTimeProgression) {
    // console.log('=== Distance Delta Audit (time-conditioned) ===');
    // console.log('Distance deltas collected:', distanceDeltasMTimeConditioned.length);
    // console.log('===============================================');
  } else {
    // console.log('=== Distance Delta Audit (geometry-only) ===');
    // console.log('Consecutive point pairs considered:', consecutivePointPairsConsidered);
    // console.log('Distance deltas collected:', distanceDeltasMGeometryOnly.length);
    // console.log('Rejected (invalid or zero distance):', rejectedDistanceInvalidOrZero);
    // console.log('============================================');
  }
  
  // Calculate statistics
  const totalDeltaCount = timeDeltasMs.length;
  let minDeltaMs = null;
  let maxDeltaMs = null;
  let medianDeltaMs = null;
  
  if (totalDeltaCount > 0) {
    // Sort deltas for median calculation
    const sortedDeltas = [...timeDeltasMs].sort((a, b) => a - b);
    
    minDeltaMs = sortedDeltas[0];
    maxDeltaMs = sortedDeltas[sortedDeltas.length - 1];
    
    // Calculate median
    const mid = Math.floor(sortedDeltas.length / 2);
    if (sortedDeltas.length % 2 === 0) {
      // Even number of elements: average of two middle values
      medianDeltaMs = (sortedDeltas[mid - 1] + sortedDeltas[mid]) / 2;
    } else {
      // Odd number of elements: middle value
      medianDeltaMs = sortedDeltas[mid];
    }
  }
  
  // Build result object
  const result = {
    timeDeltasMs: timeDeltasMs,
    totalDeltaCount: totalDeltaCount,
    minDeltaMs: minDeltaMs,
    maxDeltaMs: maxDeltaMs,
    medianDeltaMs: medianDeltaMs,
    distanceDeltasM: distanceDeltasM,
    distanceDeltasMGeometryOnly: distanceDeltasMGeometryOnly,
    distanceDeltasMTimeConditioned: distanceDeltasMTimeConditioned,
    timeDistancePairs: timeDistancePairs,
    hasTimeProgression: hasTimeProgression,
    hasValidTimestamps: hasValidTimestamps
  };
  
  // Console log the audit results
  // console.log('=== Sampling Audit Results ===');
  // console.log('Total positive deltas collected:', totalDeltaCount);
  // if (totalDeltaCount > 0) {
  //   console.log('Minimum delta (ms):', minDeltaMs);
  //   console.log('Maximum delta (ms):', maxDeltaMs);
  //   console.log('Median delta (ms):', medianDeltaMs);
  //   console.log('Minimum delta (seconds):', Math.round(minDeltaMs / 1000));
  //   console.log('Maximum delta (seconds):', Math.round(maxDeltaMs / 1000));
  //   console.log('Median delta (seconds):', Math.round(medianDeltaMs / 1000));
  // } else {
  //   console.log('No positive deltas found (insufficient valid consecutive timestamps)');
  // }
  // console.log('Total distance deltas collected:', distanceDeltasM.length);
  // console.log('================================');
  
  // Separate pass: Joint time-distance audit artifact
  // Only generate when timestamps show positive progression (hasTimeProgression)
  // Note: timeDistancePairs was initialized at the top of the function
  
  // Joint audit counters
  let jointConsecutivePairsInspected = 0;
  let jointPairsWithBothTimestamps = 0;
  let jointRejectedMissingTimestamp = 0;
  let jointRejectedNonPositiveDt = 0;
  let jointRejectedInvalidOrZeroDistance = 0;
  let jointValidPairsCollected = 0;
  
  if (hasTimeProgression) {
    let prevPoint = null;
    let prevTimestampMs = null;
    
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const timeRaw = point.timeRaw;
      
      // Check if current point has valid timestamp
      let currentTimestampMs = null;
      if (timeRaw !== null) {
        currentTimestampMs = Date.parse(timeRaw);
        if (isNaN(currentTimestampMs)) {
          currentTimestampMs = null;
        }
      }
      
      // Count consecutive pairs inspected (when we have a previous point)
      if (prevPoint !== null) {
        jointConsecutivePairsInspected++;
      }
      
      // Include pair only if both current and previous points have valid timestamps
      if (currentTimestampMs !== null && prevTimestampMs !== null && prevPoint !== null) {
        jointPairsWithBothTimestamps++;
        
        // Compute positive time delta in seconds
        const dtMs = currentTimestampMs - prevTimestampMs;
        const dtSec = dtMs / 1000;
        
        // Compute haversine distance in meters
        const ddMeters = haversineDistance(
          prevPoint.lat,
          prevPoint.lon,
          point.lat,
          point.lon
        );
        
        // Include pair only if dtSec > 0 and ddMeters > 0 and finite
        if (dtSec > 0 && isFinite(ddMeters) && ddMeters > 0) {
          jointValidPairsCollected++;
          timeDistancePairs.push({
            dtSec: dtSec,
            ddMeters: ddMeters
          });
        } else {
          if (dtSec <= 0) {
            jointRejectedNonPositiveDt++;
          }
          if (!isFinite(ddMeters) || ddMeters <= 0) {
            jointRejectedInvalidOrZeroDistance++;
          }
        }
      } else if (prevPoint !== null) {
        // We have a previous point but missing timestamp on current or previous
        jointRejectedMissingTimestamp++;
      }
      
      // Update previous point and timestamp if current has valid timestamp
      if (currentTimestampMs !== null) {
        prevPoint = { lat: point.lat, lon: point.lon };
        prevTimestampMs = currentTimestampMs;
      }
    }
    
    // Joint time-distance audit summary
    // console.log('=== Joint Time-Distance Audit ===');
    // console.log('Consecutive pairs inspected:', jointConsecutivePairsInspected);
    // console.log('Pairs with both timestamps:', jointPairsWithBothTimestamps);
    // console.log('Valid joint pairs collected:', jointValidPairsCollected);
    // console.log('Rejected:');
    // console.log('  - Missing timestamp:', jointRejectedMissingTimestamp);
    // console.log('  - Non-positive Δt:', jointRejectedNonPositiveDt);
    // console.log('  - Invalid/zero distance:', jointRejectedInvalidOrZeroDistance);
    // console.log('================================');
  }
  
  // Expose counters for pipeline status display (same values used for console logging)
  result.rejectedTimestampPairsDeltaLeqZero = rejectedTimestampPairsDeltaLeqZero;
  result.consecutivePointPairsConsidered = consecutivePointPairsConsidered;
  result.rejectedDistanceInvalidOrZero = rejectedDistanceInvalidOrZero;
  result.jointPairsWithBothTimestamps = jointPairsWithBothTimestamps;
  result.jointRejectedMissingTimestamp = jointRejectedMissingTimestamp;
  result.jointRejectedNonPositiveDt = jointRejectedNonPositiveDt;
  result.jointRejectedInvalidOrZeroDistance = jointRejectedInvalidOrZeroDistance;
  result.nonPositiveTimeDeltaEvents = nonPositiveTimeDeltaEvents;
  
  return result;
}

/**
 * Exports time deltas to JSON file
 * @param {Array<number>} timeDeltasMs - Array of time deltas in milliseconds
 * @param {string} filename - Filename for download
 */
function exportTimeDeltasJSON(timeDeltasMs, filename) {
  const exportPayload = {
    deltas: timeDeltasMs,
    count: timeDeltasMs.length
  };
  
  const jsonString = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports distance deltas to JSON file
 * @param {Array<number>} distanceDeltasM - Array of distance deltas in meters
 * @param {string} filename - Filename for download
 */
function exportDistanceDeltasJSON(distanceDeltasM, filename) {
  const exportPayload = {
    deltas: distanceDeltasM,
    count: distanceDeltasM.length
  };
  
  const jsonString = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports time-distance pairs to JSON file
 * @param {Array<{dtSec: number, ddMeters: number}>} timeDistancePairs - Array of time-distance pairs
 * @param {string} filename - Filename for download
 */
function exportTimeDistancePairsJSON(timeDistancePairs, filename) {
  const exportPayload = {
    pairs: timeDistancePairs,
    count: timeDistancePairs.length
  };
  
  const jsonString = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
