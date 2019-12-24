#include "Queue.h"

#include <esp_attr.h>
#include <string.h>

int queue_empty(queue_t* queue){
  return queue->curr_size != 0;
}

void* IRAM_ATTR queue_peek(queue_t* queue) {
  if(queue == NULL){
    return NULL;
  }
  if(queue->curr_size == 0) {
    return NULL;
  }
  void* data = queue->data[0];
  return data;
}

void* IRAM_ATTR queue_dequeue(queue_t* queue){
  void* data = queue_peek(queue);
  if(data) {
    --queue->curr_size;
    memmove(queue->data, queue->data + 1, sizeof(void*) * queue->curr_size);
  }
  return data;
}


int IRAM_ATTR queue_enqueue(queue_t* queue, void* data){
  if(queue == NULL){
    return -1;
  }
  if(queue->curr_size + 1 > queue->max_size) {
    return QUEUE_ERROR_FULL;
  }
  queue->data[queue->curr_size] = data;
  queue->curr_size += 1;
  return 0;
}
