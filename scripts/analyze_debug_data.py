#!/usr/bin/env python3

import numpy as np
import matplotlib.pyplot as plt
from argparse import ArgumentParser, RawTextHelpFormatter
import math

from typing import List


class lowpass_filter:
	def __init__(self, cutoff: float, dt: float):
		self.RC = 1 / (2 * math.pi * cutoff)
		self.alpha = dt / (self.RC + dt)
		self.state = 0

	def  add_value(self, value: float) -> float:
		# y[i] := y[i-1] + α * (x[i] - y[i-1])
		self.state =  self.state + self.alpha * (value - self.state)
		return self.state

	def adjust_dt(self, dt: float):
		self.alpha = dt / (self.RC + dt)

def mask_data(data, threshold, grace_samples):
	samples = grace_samples
	upper_mask = []
	lower_mask = []
	for data_point in data:
		if data_point >= threshold:
			upper_mask.append(0)
			lower_mask.append(1)
			samples = 0
		elif samples < grace_samples:
			upper_mask.append(0)
			lower_mask.append(1)
			samples += 1
		else:
			upper_mask.append(1)
			lower_mask.append(0)
	
	upper_data = np.ma.array(data, mask=upper_mask)
	lower_data = np.ma.array(data, mask=lower_mask)
	
	return (upper_data, lower_data)

def plot_data(data: List[int], threshold, grace_samples, lowpass: lowpass_filter, plot_magnitude:bool = False):
	raw_data = np.array(data)
	lowpass.state = raw_data[0]
	
	raw_max = [0, 0]
	filtered_max = [0, 0]
	
	
	filtered_data = []
	i = 0
	for data_point in raw_data:
		filtered_data.append(lowpass.add_value(data_point))
		if filtered_max[0] < filtered_data[-1]:
			filtered_max[0] = filtered_data[-1]
			filtered_max[1] = i
		if raw_max[0] < data_point:
			raw_max[0] = data_point
			raw_max[1] = i
		
		i += 1
	
	t = np.arange(0.0, len(raw_data), 1)

	# not used to be more flexible with sample num
	#upper_data = np.ma.masked_where(raw_data >= threshold, raw_data)
	#lower_data = np.ma.masked_where(raw_data < threshold, raw_data)
	
	upper_data, lower_data = mask_data(raw_data, threshold, grace_samples)
	upper_data_filtered, lower_data_filtered = mask_data(filtered_data, threshold, grace_samples)
	
	if plot_magnitude:
		fig, ((ax_data, ax_magitude)) = plt.subplots(2, 1)
		normalized_data = raw_data - np.mean(raw_data)
		ax_magitude.magnitude_spectrum(normalized_data, Fs=args.sampling, scale=args.scale)
	else:
		fig, ax_data = plt.subplots(1, 1)
		
	ax_data.plot(t, lower_data, t, upper_data)
	ax_data.plot(t, lower_data_filtered, t, upper_data_filtered)
	ax_data.axhline(y=threshold, color='r')
	ax_data.axvline(x=raw_max[1], color='r', label="raw max: difference {0:.2f}ms".format(abs(raw_max[1] - filtered_max[1]) * (1/args.sampling) * 1000))
	ax_data.axvline(x=filtered_max[1], label="filtered max: difference {} samples".format(abs(raw_max[1] - filtered_max[1])))
	ax_data.set_xlabel('Sample')
	ax_data.set_ylabel('Amplitude')
	ax_data.legend()


if __name__ == "__main__":
	parser = ArgumentParser(formatter_class=RawTextHelpFormatter)
	parser.add_argument("-i", "--input", dest="input", help="Path to input file", type=str)
	parser.add_argument("-s", "--sampling", dest="sampling", help="Sampling rate in Hz [default: %(default)Hz]", type=int, default=6000)
	parser.add_argument("-x", "--scale", dest="scale", help="Scaling of the frequency graph (dB, linear) [default: %(default)]", type=str, default="dB")
	parser.add_argument("-t", "--threshold", dest="threshold", help="Threshold for coloring (like shown in the app) [default: %(default)]", type=int, default=150)
	parser.add_argument("-c", "--cutoff", dest="cutoff", help="Lowpass filter cutoff [default: %(default)]", type=int, default=20)
	parser.add_argument("-m", "--magnitude", dest="enable_magnitude", help="Enable magnitude graph [default: %(default)]", action='store_true')
	args = parser.parse_args()

	data_list = []
	with open(args.input, "r", encoding='utf-8', errors='ignore') as data_file:
		inside_data = False
		for line in data_file.readlines():
			if line == "-\n": # end of data
				inside_data = False
			if inside_data:
				data_list[-1].append(int(line))

			if line == "_\n": # beginning of data
				inside_data = True
				data_list.append([])
				
	print("Got {} sets of data".format(len(data_list)))

	for data in data_list:
		plot_data(data, args.threshold * 12, 500, lowpass_filter(args.cutoff, 1/args.sampling), args.enable_magnitude)
	plt.show()
