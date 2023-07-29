#pragma once

#include <Arduino.h>

#define PACKED __attribute__((packed))

enum {
    ELRS_INT_MSP_PARAMS = 1,
};

// TODO: MSP_PORT_INBUF_SIZE should be changed to
// dynamically allocate array length based on the payload size
// Hardcoding payload size to 8 bytes for now, since MSP is
// limited to a 4 byte payload on the BF side
//#define MSP_PORT_INBUF_SIZE 16 // was 8
#define MSP_PORT_INBUF_SIZE 256

#define CHECK_PACKET_PARSING() \
    if (packet->error)         \
    {                          \
        return;                \
    }

#define MSP_VERSION     (1U << 5)
#define MSP_STARTFLAG   (1U << 4)
#define MSP_ELRS_INT    (3U << 0)

typedef enum
{
    MSP_IDLE,
    MSP_MSP_START,
    MSP_HEADER_M, // MSPv1
    MSP_HEADER_X, // MSPv2

    MSP_FLAGS,

    MSP_PAYLOAD_SIZE,
    MSP_PAYLOAD_FUNC,
    MSP_PAYLOAD,
    MSP_CHECKSUM,

    MSP_HEADER_V2_NATIVE,
    MSP_PAYLOAD_V2_NATIVE,
    MSP_CHECKSUM_V2_NATIVE,

    MSP_COMMAND_RECEIVED
} mspState_e;

typedef enum
{
    MSP_PACKET_UNKNOWN,
    MSP_PACKET_TLM_OTA, // Used to carry info OTA
    MSP_PACKET_V1_ELRS,
    MSP_PACKET_V1_CMD,
    MSP_PACKET_V1_RESP,
    MSP_PACKET_V2_COMMAND,
    MSP_PACKET_V2_RESPONSE
} mspPacketType_e;

enum
{
    MSP_VTX_ONFIG = 0x58,      // read
    MSP_VTX_SET_CONFIG = 0x59, // write
};

typedef struct PACKED
{
    uint8_t flags;
    uint8_t payloadSize;
    uint8_t function;
    uint8_t payload[];
} mspHeaderV1_t;

typedef struct PACKED
{
    uint8_t flags;
    uint16_t function;
    uint16_t payloadSize;
} mspHeaderV2_t;

typedef struct
{
    mspPacketType_e volatile type;
    uint8_t volatile WORD_ALIGNED_ATTR payload[MSP_PORT_INBUF_SIZE];
    uint16_t volatile function;
    uint16_t volatile payloadSize;
    uint16_t volatile payloadIterator;
    uint8_t volatile flags;
    bool volatile error;
    bool volatile header_sent_or_rcvd;

    inline uint8_t iterated()
    {
        return ((type != MSP_PACKET_UNKNOWN) &&
                ((0 < payloadSize && payloadSize <= payloadIterator) || (payloadSize == 0)));
    }

    void reset(void)
    {
        type = MSP_PACKET_UNKNOWN;
        flags = 0;
        function = 0;
        payloadSize = 0;
        payloadIterator = 0;
        error = false;
        header_sent_or_rcvd = false;
    }
    void ICACHE_RAM_ATTR reset(mspHeaderV1_t *hdr)
    {
        type = MSP_PACKET_UNKNOWN;
        flags = hdr->flags;
        function = hdr->function;
        payloadSize = hdr->payloadSize;
        payloadIterator = 0;
        error = false;
        header_sent_or_rcvd = false;
    }
    void ICACHE_RAM_ATTR reset(mspHeaderV2_t *hdr)
    {
        type = MSP_PACKET_UNKNOWN;
        flags = hdr->flags;
        function = hdr->function;
        payloadSize = hdr->payloadSize;
        payloadIterator = 0;
        error = false;
        header_sent_or_rcvd = false;
    }

    void ICACHE_RAM_ATTR setPayloadSize(uint8_t len)
    {
        // func + payload
        payloadSize = len + 1;
    }

    void ICACHE_RAM_ATTR addByte(uint8_t b)
    {
        if (payloadIterator >= sizeof(payload))
        {
            error = true;
            return;
        }
        payload[payloadIterator++] = b;
    }

    inline void ICACHE_RAM_ATTR setIteratorToSize()
    {
        payloadSize = payloadIterator;
        payloadIterator = 0;
    }

    inline void ICACHE_RAM_ATTR makeResponse()
    {
        type = MSP_PACKET_V2_RESPONSE;
    }

    inline void ICACHE_RAM_ATTR makeCommand()
    {
        type = MSP_PACKET_V2_COMMAND;
    }

    uint8_t ICACHE_RAM_ATTR readByte()
    {
        if (iterated())
        {
            // We are trying to read beyond the length of the payload
            error = true;
            return 0;
        }
        return payload[payloadIterator++];
    }
} mspPacket_t;

/////////////////////////////////////////////////

class MSP
{
public:
    MSP() {}
    bool processReceivedByte(uint8_t c);
    bool mspOngoing() {
        return (m_inputState != MSP_IDLE);
    }
    bool mspReceived() {
        return (m_inputState == MSP_COMMAND_RECEIVED);
    }
    mspPacket_t &getPacket() {
        return m_packet;
    }
    mspPacket_t *getPacketPtr() {
        return &m_packet;
    }
    void markPacketFree();
    uint8_t sendPacket(mspPacket_t *packet, uint8_t *port);
    uint8_t sendPacket(uint8_t *port, mspPacketType_e type,
                       uint16_t function, uint8_t flags,
                       uint8_t len, uint8_t const * payload);

private:
    mspPacket_t m_packet;
    mspState_e m_inputState = MSP_IDLE;
    uint16_t m_offset = 0;
    uint8_t m_crc = 0, m_crc_v1 = 0;
};
