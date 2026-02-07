# Dependencies
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  stop("Package 'jsonlite' is required. Install it via install.packages('jsonlite')")
}
library(jsonlite)

# Pick JSON file interactively
json_path <- file.choose()

json_obj <- tryCatch(
  fromJSON(json_path),
  error = function(e) {
    stop("Failed to parse JSON file: ", e$message)
  }
)

# Validate structure
if (!is.list(json_obj) || is.null(json_obj$timeDeltasMs)) {
  stop("JSON does not contain expected field: 'timeDeltasMs'")
}

deltas_ms <- unlist(json_obj$timeDeltasMs, use.names = FALSE)
is.numeric(delta_ms)
length(delta_ms)
# Validate data
if (!is.numeric(deltas_ms)) {
  stop("'timeDeltasMs' is not numeric")
}

if (length(deltas_ms) < 10) {
  stop("Not enough data points to compute KDE")
}

# Defensive filtering
deltas_ms_clean <- deltas_ms[is.finite(deltas_ms) & deltas_ms > 0]

if (length(deltas_ms_clean) < 10) {
  stop("Not enough valid deltas after filtering")
}

# Convert to seconds
deltas_sec <- deltas_ms_clean / 1000

# KDE
density_est <- tryCatch(
  density(deltas_sec),
  error = function(e) {
    stop("Density estimation failed: ", e$message)
  }
)

# Plot
plot(
  density_est,
  main = "Kernel Density of Time Deltas",
  xlab = "Time delta (seconds)",
  ylab = "Density",
  lwd = 2
)

# Mark dominant peak
peak_index <- which.max(density_est$y)
peak_x <- density_est$x[peak_index]

abline(v = peak_x, lty = 2, col = "red")
text(
  x = peak_x,
  y = max(density_est$y),
  labels = paste0("Peak ≈ ", round(peak_x, 2), " s"),
  pos = 4,
  col = "red"
)

cat("\n--- Sampling KDE Summary ---\n")
cat("Points used:", length(deltas_sec), "\n")
cat("Dominant peak (s):", round(peak_x, 3), "\n")
cat("---------------------------\n")
