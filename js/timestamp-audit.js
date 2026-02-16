/**
 * Timestamp Audit Module
 * Observational audit pass for timestamp data in GPX points
 * Does NOT mutate, reorder, or normalize timestamps
 */

/**
 * Audits timestamps in an array of points
 * Uses anchor-based monotonic detection for backtracking blocks
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
  
  // Anchor-based backtracking detection
  let anchorTimestampMs = null; // Monotonic high-water mark; only advances on forward movement
  const backtrackingBlocks = [];
  let totalBacktrackingPoints = 0;
  
  // Current backtracking block state
  let inBlock = false;
  let currentBlockStartIndex = null;
  let currentBlockEndIndex = null;
  let currentBlockLength = 0;
  let currentBlockMaxDepthMs = 0;
  
  // Raw session duration tracking
  let firstValidTimestampMs = null;
  
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
    
    // Track first valid timestamp (set once)
    if (firstValidTimestampMs === null) {
      firstValidTimestampMs = timestampMs;
    }
    
    // At this point, we have a valid parsed timestamp
    // Compare with last valid timestamp (if exists)
    if (lastValidTimestampMs !== null) {
      // Check for duplicate timestamp (equal to previous valid)
      if (timestampMs === lastValidTimestampMs) {
        duplicateTimestampCount++;
        duplicateTimestampEvents.push({
          index: i,
          prevIndex: lastValidTimestampIndex,
          time: formatTime(timeRaw)
        });
      }
      // Forward: timestamp at or above anchor
      else if (timestampMs >= anchorTimestampMs) {
        strictlyIncreasingCount++;
        
        // Close open backtracking block if any
        if (inBlock) {
          backtrackingBlocks.push({
            startIndex: currentBlockStartIndex,
            endIndex: currentBlockEndIndex,
            length: currentBlockLength,
            maxDepthMs: currentBlockMaxDepthMs
          });
          inBlock = false;
          currentBlockStartIndex = null;
          currentBlockEndIndex = null;
          currentBlockLength = 0;
          currentBlockMaxDepthMs = 0;
        }
        
        // Update anchor to new high-water mark
        anchorTimestampMs = timestampMs;
      }
      // Backtracking: timestamp below anchor
      else {
        backwardTimestampCount++;
        totalBacktrackingPoints++;
        
        const depth = anchorTimestampMs - timestampMs;
        
        // Update maxBackwardJumpMs (global max across all blocks)
        if (maxBackwardJumpMs === null || depth > maxBackwardJumpMs) {
          maxBackwardJumpMs = depth;
        }
        
        // Track backtracking block
        if (!inBlock) {
          // Start new block
          inBlock = true;
          currentBlockStartIndex = i;
          currentBlockEndIndex = i;
          currentBlockLength = 1;
          currentBlockMaxDepthMs = depth;
        } else {
          // Continue existing block
          currentBlockEndIndex = i;
          currentBlockLength++;
          if (depth > currentBlockMaxDepthMs) {
            currentBlockMaxDepthMs = depth;
          }
        }
        
        // Log backward event
        backwardTimestampEvents.push({
          index: i,
          prevIndex: lastValidTimestampIndex,
          prevTime: formatTime(lastValidTimestampRaw),
          currTime: formatTime(timeRaw)
        });
      }
    } else {
      // First valid timestamp: initialize anchor
      anchorTimestampMs = timestampMs;
    }
    
    // Update last valid timestamp for next comparison
    lastValidTimestampMs = timestampMs;
    lastValidTimestampIndex = i;
    lastValidTimestampRaw = timeRaw;
  }
  
  // Close any open backtracking block at end of file
  if (inBlock) {
    backtrackingBlocks.push({
      startIndex: currentBlockStartIndex,
      endIndex: currentBlockEndIndex,
      length: currentBlockLength,
      maxDepthMs: currentBlockMaxDepthMs
    });
  }
  
  // Compute largest backtracking block length
  let largestBacktrackingBlockLength = 0;
  for (let b = 0; b < backtrackingBlocks.length; b++) {
    if (backtrackingBlocks[b].length > largestBacktrackingBlockLength) {
      largestBacktrackingBlockLength = backtrackingBlocks[b].length;
    }
  }
  
  // Raw session duration: last valid timestamp - first valid timestamp (in original point order)
  let rawSessionDurationSec = null;
  if (firstValidTimestampMs !== null && lastValidTimestampMs !== null && lastValidTimestampMs !== firstValidTimestampMs) {
    rawSessionDurationSec = (lastValidTimestampMs - firstValidTimestampMs) / 1000;
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
    duplicateTimestampEvents: duplicateTimestampEvents,
    rawSessionDurationSec: rawSessionDurationSec,
    backtrackingBlocks: backtrackingBlocks,
    totalBacktrackingPoints: totalBacktrackingPoints,
    largestBacktrackingBlockLength: largestBacktrackingBlockLength
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
