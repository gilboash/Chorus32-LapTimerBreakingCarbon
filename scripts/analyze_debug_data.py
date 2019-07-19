#!/usr/bin/env python3

import numpy as np
import matplotlib.pyplot as plt
from argparse import ArgumentParser, RawTextHelpFormatter
import math
import sys

import scipy.signal

from typing import List, Tuple

def scipy_lowpass(cutoff, fs, order=5, function=scipy.signal.butter):
	nyq = 0.5 * fs
	normal_cutoff = cutoff / nyq
	b, a = function(order, normal_cutoff, btype='low', analog=False)
	return b, a

def scipy_lowpass_filter(data, cutoff, fs, order=5, function=scipy.signal.butter):
	b, a = scipy_lowpass(cutoff, fs, order=order, function=function)
	y = scipy.signal.lfilter(b, a, data)
	return y


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

def mask_data(data: List[int], threshold: int, grace_samples: int) -> Tuple[np.ma.array, np.ma.array]:
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

def plot_data(data: List[int], threshold: int, grace_samples: int, filter_cutoff, filter_num, filter_sampling, plot_magnitude:bool = False, scipy_filter = None):
	
	lowpass_filters = []
	for i in range(args.filter_num):
		lowpass_filters.append(lowpass_filter(filter_cutoff, 1/filter_sampling))
	
	raw_data = np.array(data)
	for lowpass in lowpass_filters:
		# Only apply this if we have no filter to compare to. No clue on how to set the initial value
		if scipy_filter is None:
			lowpass.state = raw_data[0]

	raw_max = [0, 0]
	filtered_max = [0, 0]

	filtered_data = []
	i = 0
	for data_point in raw_data:
		val = data_point
		for lowpass in lowpass_filters:
			val = lowpass.add_value(val)
		filtered_data.append(val)
		if filtered_max[0] < filtered_data[-1]:
			filtered_max[0] = filtered_data[-1]
			filtered_max[1] = i
		if raw_max[0] < data_point:
			raw_max[0] = data_point
			raw_max[1] = i

		i += 1
	
	filtered_data2 = 0
	if scipy_filter is not None:
		filtered_data2 = scipy_lowpass_filter(raw_data, filter_cutoff, filter_sampling, filter_num, scipy_filter)

	t = np.arange(0.0, len(raw_data), 1)

	# not used to be more flexible with sample num
	#upper_data = np.ma.masked_where(raw_data >= threshold, raw_data)
	#lower_data = np.ma.masked_where(raw_data < threshold, raw_data)

	upper_data, lower_data = mask_data(raw_data, threshold, grace_samples)
	upper_data_filtered, lower_data_filtered = mask_data(filtered_data, threshold, grace_samples)

	old_trigger_index = upper_data_filtered.nonzero()[0][0]

	if plot_magnitude:
		fig, ((ax_data, ax_magitude)) = plt.subplots(2, 1)
		normalized_data = raw_data - np.mean(raw_data)
		ax_magitude.magnitude_spectrum(normalized_data, Fs=args.sampling, scale=args.scale)
	else:
		fig, ax_data = plt.subplots(1, 1)

	ax_data.plot(t, lower_data, t, upper_data)
	ax_data.plot(t, lower_data_filtered, t, upper_data_filtered)
	if scipy_filter is not None:
		ax_data.plot(t, filtered_data2, label="Scipy filter")

	ax_data.axhline(y=threshold, color='r')
	ax_data.axvline(x=raw_max[1], color='r', label="raw max: difference {0:.2f}ms".format(abs(raw_max[1] - filtered_max[1]) * (1/args.sampling) * 1000))
	ax_data.axvline(x=filtered_max[1], label="filtered max: difference {} samples".format(abs(raw_max[1] - filtered_max[1])))
	ax_data.axvline(x=old_trigger_index, color='g', label="Old trigger: diff {0:.2f}ms".format(abs(filtered_max[1] - old_trigger_index) * (1/args.sampling) * 1000))
	ax_data.set_xlabel('Sample')
	ax_data.set_ylabel('Amplitude')
	ax_data.legend()


if __name__ == "__main__":
	parser = ArgumentParser(formatter_class=RawTextHelpFormatter)
	parser.add_argument("-i", "--input", dest="input", help="Path to input file", type=str, required=True)
	parser.add_argument("-s", "--sampling", dest="sampling", help="Sampling rate in Hz [default: %(default)dHz]", type=int, default=6000)
	parser.add_argument("-x", "--scale", dest="scale", help="Scaling of the frequency graph (dB, linear) [default: %(default)s]", type=str, default="dB")
	parser.add_argument("-t", "--threshold", dest="threshold", help="Threshold for coloring (like shown in the app) [default: %(default)d]", type=int, default=150)
	parser.add_argument("-c", "--cutoff", dest="cutoff", help="Lowpass filter cutoff [default: %(default)d]", type=int, default=20)
	parser.add_argument("--filter-sampling", dest="filter_sampling", help="Separate filter sampling rate", type=int)
	parser.add_argument("--filter-num", dest="filter_num", help="Number of lowpass filters [default: %(default)d]", type=int, default=1)
	parser.add_argument("--filter-scipy", dest="scipy_filter", help="Scipy filter to compare. Valid are butter and bessel. Order is determined by filter-num", type=str, default=None)
	parser.add_argument("-m", "--magnitude", dest="enable_magnitude", help="Enable magnitude graph", action='store_true')
	parser.add_argument("-d", "--drop", dest="drop", help="keep every x sample [default: %(default)d]", type=int, default=1)
	args = parser.parse_args()

	args.sampling /= args.drop

	print("Sampling: {}".format(args.sampling))
	data_list = []
	if args.input is None:
		parser.print_help()
		sys.exit(1)

	with open(args.input, "r", encoding='utf-8', errors='ignore') as data_file:
		inside_data = False
		i = 1
		for line in data_file.readlines():
			if line == "-\n": # end of data
				inside_data = False
			if inside_data:
				if i == args.drop:
					data_list[-1].append(int(line))
					i = 1
				else:
					i +=1

			if line == "_\n": # beginning of data
				inside_data = True
				data_list.append([])

	print("Got {} sets of data".format(len(data_list)))

	scipy_filter = None
	if args.scipy_filter == "bessel":
		scipy_filter = scipy.signal.bessel
	elif args.scipy_filter == "butter":
		scipy_filter = scipy.signal.butter

	filter_sampling = args.sampling
	if args.filter_sampling is not None:
		filter_sampling = args.filter_sampling
	for data in data_list:
		plot_data(data, args.threshold * 12, 500, args.cutoff, args.filter_num, filter_sampling, args.enable_magnitude, scipy_filter)
	plt.show()
