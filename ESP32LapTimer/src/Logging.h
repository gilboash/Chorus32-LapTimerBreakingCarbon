#ifndef _LOGGING_H_
#define _LOGGING_H_
#include <FS.h>
#include <string>


void set_chorus_log(bool enable);
//void logToFile(const String &msg);
void logToFile(const char *fmt, ...);

void shouldLogFileTruncate();

void initLogFile();
void closeLog() ;


#endif // _LOGGING_H_
