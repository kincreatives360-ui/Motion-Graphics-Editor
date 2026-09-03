/**
 * Renders real-time audio spectrum FFT frequency bars or oscilloscope waveform.
 */
export function drawAudioSpectrum(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  width: number,
  height: number,
  mode: "bars" | "waveform" = "bars",
  color = "#38bdf8",
) {
  if (!analyser || width <= 0 || height <= 0) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  ctx.save();

  if (mode === "waveform") {
    analyser.getByteTimeDomainData(dataArray);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  } else {
    // FFT Frequency Bars
    analyser.getByteFrequencyData(dataArray);
    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height;

      ctx.fillStyle = color;
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

      x += barWidth;
      if (x >= width) break;
    }
  }

  ctx.restore();
}

