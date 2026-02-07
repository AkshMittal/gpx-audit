/**
 * Timestamp Audit Module
 * Observational audit pass for timestamp data in GPX points
 * Does NOT mutate, reorder, or normalize timestamps
 */

/**
 * Audits timestamps in an array of points
 * @param {Array} points - Array of point objects with timeRaw property
 * @returns {Object} Audit metadata object with counters
 */
function auditTimestamps(points) {
  // Initialize counters
  const totalPointsChecked = points.length;
  let missingTimestampCount = 0;
  let unparsableTimestampCount = 0;
  let duplicateTimestampCount = 0;
  let backwardTimestampCount = 0;
  let strictlyIncreasingCount = 0; // Points in increasing order
  let maxBackwardJumpMs = null; // null if no backward jumps observed
  
  // Collect flagged events
  const backwardTimestampEvents = [];
  const duplicateTimestampEvents = [];
  
  let lastValidTimestampMs = null;
  let lastValidTimestampIndex = null;
  let lastValidTimestampRaw = null;
  
  // Helper to format time for display
  const formatTime = (timeRaw) => {
    if (!timeRaw) return '';
    const d = new Date(timeRaw);
    if (isNaN(d.getTime())) return timeRaw;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };
  
  // Iterate through all points
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const timeRaw = point.timeRaw;
    
    // Check for missing timestamp
    if (timeRaw === null) {
      missingTimestampCount++;
      continue; // Skip comparison for missing timestamps
    }
    
    // Attempt to parse timestamp
    const timestampMs = Date.parse(timeRaw);
    
    // Check if parsing failed
    if (isNaN(timestampMs)) {
      unparsableTimestampCount++;
      continue; // Skip comparison for unparsable timestamps
    }
    
    // At this point, we have a valid parsed timestamp
    // Compare with last valid timestamp (if exists)
    if (lastValidTimestampMs !== null) {
      // Check for duplicate timestamp (equal to last)
      if (timestampMs === lastValidTimestampMs) {
        duplicateTimestampCount++;
        duplicateTimestampEvents.push({
          index: i,
          prevIndex: lastValidTimestampIndex,
          time: formatTime(timeRaw)
        });
      }
      // Check for backward timestamp (less than last)
      else if (timestampMs < lastValidTimestampMs) {
        backwardTimestampCount++;
        const backwardJump = lastValidTimestampMs - timestampMs;
        
        // Track maximum backward jump
        if (maxBackwardJumpMs === null || backwardJump > maxBackwardJumpMs) {
          maxBackwardJumpMs = backwardJump;
        }
        
        backwardTimestampEvents.push({
          index: i,
          prevIndex: lastValidTimestampIndex,
          prevTime: formatTime(lastValidTimestampRaw),
          currTime: formatTime(timeRaw)
        });
      }
      // Check for strictly increasing timestamp (greater than last - correct order)
      else if (timestampMs > lastValidTimestampMs) {
        strictlyIncreasingCount++;
      }
    }
    
    // Update last valid timestamp for next comparison
    lastValidTimestampMs = timestampMs;
    lastValidTimestampIndex = i;
    lastValidTimestampRaw = timeRaw;
  }
  
  // Build audit metadata object
  const auditMetadata = {
    totalPointsChecked: totalPointsChecked,
    missingTimestampCount: missingTimestampCount,
    unparsableTimestampCount: unparsableTimestampCount,
    duplicateTimestampCount: duplicateTimestampCount,
    backwardTimestampCount: backwardTimestampCount,
    strictlyIncreasingCount: strictlyIncreasingCount,
    maxBackwardJumpMs: maxBackwardJumpMs,
    backwardTimestampEvents: backwardTimestampEvents,
    duplicateTimestampEvents: duplicateTimestampEvents
  };
  
  // Console log the audit results
  // console.log('=== Timestamp Audit Results ===');
  // console.log('Total points checked:', totalPointsChecked);
  // console.log('Missing timestamps:', missingTimestampCount);
  // console.log('Unparsable timestamps:', unparsableTimestampCount);
  // console.log('Duplicate timestamps:', duplicateTimestampCount);
  // console.log('Backward timestamps:', backwardTimestampCount);
  // console.log('Strictly increasing timestamps:', strictlyIncreasingCount);
  // if (maxBackwardJumpMs !== null) {
  //   console.log('Maximum backward jump (ms):', maxBackwardJumpMs);
  //   console.log('Maximum backward jump (seconds):', Math.round(maxBackwardJumpMs / 1000));
  // } else {
  //   console.log('Maximum backward jump (ms):', 'N/A (no backward jumps observed)');
  // }
  // console.log('================================');
  
  return auditMetadata;
}
