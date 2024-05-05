# Audyssey Calibration with REW: New Multi-Click Tool

I was really intrigued when OCA released his AudysseyONE tool, and I’ve been working on my own version ever since, starting by shamelessly just copying his. 
The method appears similar on the surface, but theres quite a few choices made under the hood based on my own preferences. For a 5.1 system, it performs around 500 calls to REW.

Like AudysseyONE, it’s a single-page HTML app that you download and open from your computer (running it from GitHub won't allow access to your local REW API) that operates on your .ady files from the Audyssey app.

If you have some saved .ady files, you can play around with it, as one of its key "features" is that I've tried to be very clear in the log with what it does, and I leave some (to me anyway..) fun graphs in REW after the optimization process is done, to be able to look at them and geek out a little before transferring the results to the AVR. For instance, I learnt that some of my saved measurements were too heavily influenced by the head rest in my MLP, so I will adjust how I select my 3-8 measuring positions onwards. And if you don't like what it seems that the tool will achieve, you may want to tinker with the settings and try again.

Key Features:

- The filter creation method is based on the trace arithmetic against a target curve method, avoiding boosting nulls and being more subtractive than additive, and phase-friendly.
- Robust level calibration on a specifically smoothed, selected frequency ranges, done after individual channel EQ. This makes it less likely to be fooled by bumpy pre-calibration responses or reverberant rooms and such. I've put some effort into tailoring it so that it finds similar left-right levels in a symmetric room, because that's how I want it to behave, to me it doesn't sound right when I pull the entire right speaker down in level just because it's a bit closer to a side wall, I prefer my method.
- Adds a 12dB/oct HPF to your speakers, aligning with the asymmetric 24/12 AVR bass management behavior, enhancing sub-mains integration.
- Highly configurable through the UI in most technical aspects, except for the main algorithm and the ability to skip steps.
- I've tried to make the code readable and easy to build on/modify, encouraging others to do exactly that, but I had to learn JavaScript for this project, so..
- Provides detailed logs and simulated "After" graphs in REW, including simulated assumed AVR bass management behavior for inspection.
- Works with a single subwoofer, a virtual subwoofer like several behind a MiniDSP, and with multiple subwoofers hooked up directly to the receiver. I've actually unplugged my own two MiniDSPs right now.

I’m quite pleased with the results I’m getting thus far. The trace arithmetic method instead of EQ seems to work really well.

Checking the group delay for the excess phase of the measurements, it seems the filters magically knows to avoid to apply boost to non-flat regions (i.e. non-minimum-phase regions) of the response. I like it.
