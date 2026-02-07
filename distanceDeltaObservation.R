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
if (!is.list(json_obj) || is.null(json_obj$deltas)) {
  stop("JSON does not contain expected field: 'deltas'")
}

# Extract distance deltas (meters)
deltas_m <- unlist(json_obj$deltas, use.names = FALSE)

# Validate data
if (!is.numeric(deltas_m)) {
  stop("'deltas' is not numeric")
}

if (length(deltas_m) < 10) {
  stop("Not enough data points to compute KDE")
}

# Defensive filtering (same philosophy as time script)
deltas_m_clean <- deltas_m[is.finite(deltas_m) & deltas_m > 0]

if (length(deltas_m_clean) < 10) {
  stop("Not enough valid deltas after filtering")
}

# KDE (raw meters)
density_est <- tryCatch(
  density(deltas_m_clean),
  error = function(e) {
    stop("Density estimation failed: ", e$message)
  }
)

# Plot
plot(
  density_est,
  main = "Kernel Density of Distance Deltas",
  xlab = "Distance delta (meters)",
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
  labels = paste0("Peak ≈ ", round(peak_x, 2), " m"),
  pos = 4,
  col = "red"
)

cat("\n--- Distance Delta KDE Summary ---\n")
cat("Points used:", length(deltas_m_clean), "\n")
cat("Dominant peak (m):", round(peak_x, 3), "\n")
cat("---------------------------------\n")
