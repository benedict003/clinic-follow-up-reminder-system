/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.19-MariaDB, for Win64 (AMD64)
--
-- Host: 127.0.0.1    Database: clinic_followup_m16
-- ------------------------------------------------------
-- Server version	10.11.19-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `clinic_followup_m16`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `clinic_followup_m16` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `clinic_followup_m16`;

--
-- Table structure for table `follow_up_events`
--

DROP TABLE IF EXISTS `follow_up_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `follow_up_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `follow_up_id` int(11) NOT NULL,
  `kind` enum('scheduled','contacted','rescheduled','closed','note') NOT NULL,
  `outcome` varchar(40) DEFAULT NULL,
  `note` varchar(400) DEFAULT NULL,
  `from_due` date DEFAULT NULL,
  `to_due` date DEFAULT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `actor_name` varchar(200) DEFAULT NULL,
  `actor_role` varchar(20) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ev_fu` (`follow_up_id`,`id`),
  KEY `idx_ev_kind` (`kind`,`created_at`),
  CONSTRAINT `fk_ev_fu` FOREIGN KEY (`follow_up_id`) REFERENCES `follow_ups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `follow_up_events`
--

LOCK TABLES `follow_up_events` WRITE;
/*!40000 ALTER TABLE `follow_up_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `follow_up_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `follow_ups`
--

DROP TABLE IF EXISTS `follow_ups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `follow_ups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `patient_id` varchar(50) NOT NULL,
  `due_date` date NOT NULL,
  `reason` varchar(300) NOT NULL,
  `status` enum('scheduled','reminded','closed') NOT NULL DEFAULT 'scheduled',
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `created_at` varchar(30) NOT NULL,
  `closed_at` datetime DEFAULT NULL,
  `close_outcome` varchar(40) DEFAULT NULL,
  `close_note` varchar(400) DEFAULT NULL,
  `contact_attempts` int(11) NOT NULL DEFAULT 0,
  `last_contact_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fu_due` (`status`,`due_date`),
  KEY `idx_fu_patient` (`patient_id`,`id`),
  CONSTRAINT `fk_fu_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=401 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `follow_ups`
--

LOCK TABLES `follow_ups` WRITE;
/*!40000 ALTER TABLE `follow_ups` DISABLE KEYS */;
INSERT INTO `follow_ups` VALUES
(1,'P-0001','2026-10-26','Routine review 1: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(2,'P-0002','2026-10-27','Routine review 2: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(3,'P-0003','2026-10-28','Routine review 3: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(4,'P-0004','2026-10-29','Routine review 4: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(5,'P-0005','2026-10-30','Routine review 5: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(6,'P-0006','2026-10-31','Routine review 6: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(7,'P-0007','2026-11-01','Routine review 7: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(8,'P-0008','2026-11-02','Routine review 8: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(9,'P-0009','2026-11-03','Routine review 9: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(10,'P-0010','2026-11-04','Routine review 10: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(11,'P-0011','2026-11-05','Routine review 11: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(12,'P-0012','2026-11-06','Routine review 12: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(13,'P-0013','2026-11-07','Routine review 13: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(14,'P-0014','2026-11-08','Routine review 14: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(15,'P-0015','2026-11-09','Routine review 15: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(16,'P-0016','2026-11-10','Routine review 16: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(17,'P-0017','2026-11-11','Routine review 17: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(18,'P-0018','2026-11-12','Routine review 18: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(19,'P-0019','2026-11-13','Routine review 19: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(20,'P-0020','2026-11-14','Routine review 20: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(21,'P-0021','2026-11-15','Routine review 21: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(22,'P-0022','2026-11-16','Routine review 22: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(23,'P-0023','2026-11-17','Routine review 23: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(24,'P-0024','2026-11-18','Routine review 24: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(25,'P-0025','2026-11-19','Routine review 25: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(26,'P-0026','2026-11-20','Routine review 26: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(27,'P-0027','2026-11-21','Routine review 27: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(28,'P-0028','2026-11-22','Routine review 28: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(29,'P-0029','2026-11-23','Routine review 29: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(30,'P-0030','2026-11-24','Routine review 30: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(31,'P-0031','2026-11-25','Routine review 31: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(32,'P-0032','2026-11-26','Routine review 32: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(33,'P-0033','2026-11-27','Routine review 33: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(34,'P-0034','2026-11-28','Routine review 34: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(35,'P-0035','2026-11-29','Routine review 35: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(36,'P-0036','2026-11-30','Routine review 36: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(37,'P-0037','2026-12-01','Routine review 37: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(38,'P-0038','2026-12-02','Routine review 38: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(39,'P-0039','2026-12-03','Routine review 39: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(40,'P-0040','2026-12-04','Routine review 40: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(41,'P-0041','2026-12-05','Routine review 41: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(42,'P-0042','2026-12-06','Routine review 42: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(43,'P-0043','2026-12-07','Routine review 43: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(44,'P-0044','2026-12-08','Routine review 44: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(45,'P-0045','2026-12-09','Routine review 45: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(46,'P-0046','2026-12-10','Routine review 46: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(47,'P-0047','2026-12-11','Routine review 47: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(48,'P-0048','2026-12-12','Routine review 48: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(49,'P-0049','2026-12-13','Routine review 49: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(50,'P-0050','2026-12-14','Routine review 50: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(51,'P-0051','2026-12-15','Routine review 51: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(52,'P-0052','2026-12-16','Routine review 52: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(53,'P-0053','2026-12-17','Routine review 53: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(54,'P-0054','2026-12-18','Routine review 54: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(55,'P-0055','2026-12-19','Routine review 55: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(56,'P-0056','2026-12-20','Routine review 56: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(57,'P-0057','2026-12-21','Routine review 57: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(58,'P-0058','2026-12-22','Routine review 58: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(59,'P-0059','2026-12-23','Routine review 59: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(60,'P-0060','2026-12-24','Routine review 60: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(61,'P-0001','2026-12-25','Routine review 61: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(62,'P-0002','2026-10-26','Routine review 62: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(63,'P-0003','2026-10-27','Routine review 63: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(64,'P-0004','2026-10-28','Routine review 64: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(65,'P-0005','2026-10-29','Routine review 65: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(66,'P-0006','2026-10-30','Routine review 66: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(67,'P-0007','2026-10-31','Routine review 67: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(68,'P-0008','2026-11-01','Routine review 68: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(69,'P-0009','2026-11-02','Routine review 69: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(70,'P-0010','2026-11-03','Routine review 70: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(71,'P-0011','2026-11-04','Routine review 71: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(72,'P-0012','2026-11-05','Routine review 72: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(73,'P-0013','2026-11-06','Routine review 73: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(74,'P-0014','2026-11-07','Routine review 74: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(75,'P-0015','2026-11-08','Routine review 75: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(76,'P-0016','2026-11-09','Routine review 76: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(77,'P-0017','2026-11-10','Routine review 77: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(78,'P-0018','2026-11-11','Routine review 78: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(79,'P-0019','2026-11-12','Routine review 79: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(80,'P-0020','2026-11-13','Routine review 80: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(81,'P-0021','2026-11-14','Routine review 81: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(82,'P-0022','2026-11-15','Routine review 82: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(83,'P-0023','2026-11-16','Routine review 83: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(84,'P-0024','2026-11-17','Routine review 84: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(85,'P-0025','2026-11-18','Routine review 85: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(86,'P-0026','2026-11-19','Routine review 86: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(87,'P-0027','2026-11-20','Routine review 87: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(88,'P-0028','2026-11-21','Routine review 88: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(89,'P-0029','2026-11-22','Routine review 89: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(90,'P-0030','2026-11-23','Routine review 90: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(91,'P-0031','2026-11-24','Routine review 91: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(92,'P-0032','2026-11-25','Routine review 92: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(93,'P-0033','2026-11-26','Routine review 93: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(94,'P-0034','2026-11-27','Routine review 94: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(95,'P-0035','2026-11-28','Routine review 95: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(96,'P-0036','2026-11-29','Routine review 96: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(97,'P-0037','2026-11-30','Routine review 97: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(98,'P-0038','2026-12-01','Routine review 98: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(99,'P-0039','2026-12-02','Routine review 99: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(100,'P-0040','2026-12-03','Routine review 100: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(101,'P-0041','2026-12-04','Routine review 101: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(102,'P-0042','2026-12-05','Routine review 102: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(103,'P-0043','2026-12-06','Routine review 103: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(104,'P-0044','2026-12-07','Routine review 104: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(105,'P-0045','2026-12-08','Routine review 105: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(106,'P-0046','2026-12-09','Routine review 106: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(107,'P-0047','2026-12-10','Routine review 107: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(108,'P-0048','2026-12-11','Routine review 108: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(109,'P-0049','2026-12-12','Routine review 109: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(110,'P-0050','2026-12-13','Routine review 110: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(111,'P-0051','2026-12-14','Routine review 111: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(112,'P-0052','2026-12-15','Routine review 112: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(113,'P-0053','2026-12-16','Routine review 113: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(114,'P-0054','2026-12-17','Routine review 114: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(115,'P-0055','2026-12-18','Routine review 115: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(116,'P-0056','2026-12-19','Routine review 116: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(117,'P-0057','2026-12-20','Routine review 117: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(118,'P-0058','2026-12-21','Routine review 118: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(119,'P-0059','2026-12-22','Routine review 119: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(120,'P-0060','2026-12-23','Routine review 120: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(121,'P-0001','2026-12-24','Routine review 121: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(122,'P-0002','2026-12-25','Routine review 122: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(123,'P-0003','2026-10-26','Routine review 123: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(124,'P-0004','2026-10-27','Routine review 124: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(125,'P-0005','2026-10-28','Routine review 125: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(126,'P-0006','2026-10-29','Routine review 126: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(127,'P-0007','2026-10-30','Routine review 127: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(128,'P-0008','2026-10-31','Routine review 128: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(129,'P-0009','2026-11-01','Routine review 129: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(130,'P-0010','2026-11-02','Routine review 130: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(131,'P-0011','2026-11-03','Routine review 131: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(132,'P-0012','2026-11-04','Routine review 132: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(133,'P-0013','2026-11-05','Routine review 133: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(134,'P-0014','2026-11-06','Routine review 134: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(135,'P-0015','2026-11-07','Routine review 135: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(136,'P-0016','2026-11-08','Routine review 136: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(137,'P-0017','2026-11-09','Routine review 137: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(138,'P-0018','2026-11-10','Routine review 138: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(139,'P-0019','2026-11-11','Routine review 139: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(140,'P-0020','2026-11-12','Routine review 140: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(141,'P-0021','2026-11-13','Routine review 141: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(142,'P-0022','2026-11-14','Routine review 142: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(143,'P-0023','2026-11-15','Routine review 143: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(144,'P-0024','2026-11-16','Routine review 144: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(145,'P-0025','2026-11-17','Routine review 145: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(146,'P-0026','2026-11-18','Routine review 146: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(147,'P-0027','2026-11-19','Routine review 147: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(148,'P-0028','2026-11-20','Routine review 148: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(149,'P-0029','2026-11-21','Routine review 149: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(150,'P-0030','2026-11-22','Routine review 150: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(151,'P-0031','2026-11-23','Routine review 151: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(152,'P-0032','2026-11-24','Routine review 152: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(153,'P-0033','2026-11-25','Routine review 153: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(154,'P-0034','2026-11-26','Routine review 154: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(155,'P-0035','2026-11-27','Routine review 155: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(156,'P-0036','2026-11-28','Routine review 156: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(157,'P-0037','2026-11-29','Routine review 157: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(158,'P-0038','2026-11-30','Routine review 158: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(159,'P-0039','2026-12-01','Routine review 159: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(160,'P-0040','2026-12-02','Routine review 160: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(161,'P-0041','2026-12-03','Routine review 161: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(162,'P-0042','2026-12-04','Routine review 162: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(163,'P-0043','2026-12-05','Routine review 163: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(164,'P-0044','2026-12-06','Routine review 164: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(165,'P-0045','2026-12-07','Routine review 165: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(166,'P-0046','2026-12-08','Routine review 166: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(167,'P-0047','2026-12-09','Routine review 167: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(168,'P-0048','2026-12-10','Routine review 168: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(169,'P-0049','2026-12-11','Routine review 169: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(170,'P-0050','2026-12-12','Routine review 170: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(171,'P-0051','2026-12-13','Routine review 171: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(172,'P-0052','2026-12-14','Routine review 172: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(173,'P-0053','2026-12-15','Routine review 173: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(174,'P-0054','2026-12-16','Routine review 174: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(175,'P-0055','2026-12-17','Routine review 175: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(176,'P-0056','2026-12-18','Routine review 176: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(177,'P-0057','2026-12-19','Routine review 177: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(178,'P-0058','2026-12-20','Routine review 178: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(179,'P-0059','2026-12-21','Routine review 179: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(180,'P-0060','2026-12-22','Routine review 180: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(181,'P-0001','2026-12-23','Routine review 181: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(182,'P-0002','2026-12-24','Routine review 182: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(183,'P-0003','2026-12-25','Routine review 183: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(184,'P-0004','2026-10-26','Routine review 184: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(185,'P-0005','2026-10-27','Routine review 185: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(186,'P-0006','2026-10-28','Routine review 186: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(187,'P-0007','2026-10-29','Routine review 187: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(188,'P-0008','2026-10-30','Routine review 188: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(189,'P-0009','2026-10-31','Routine review 189: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(190,'P-0010','2026-11-01','Routine review 190: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(191,'P-0011','2026-11-02','Routine review 191: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(192,'P-0012','2026-11-03','Routine review 192: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(193,'P-0013','2026-11-04','Routine review 193: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(194,'P-0014','2026-11-05','Routine review 194: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(195,'P-0015','2026-11-06','Routine review 195: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(196,'P-0016','2026-11-07','Routine review 196: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(197,'P-0017','2026-11-08','Routine review 197: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(198,'P-0018','2026-11-09','Routine review 198: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(199,'P-0019','2026-11-10','Routine review 199: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(200,'P-0020','2026-11-11','Routine review 200: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(201,'P-0021','2026-11-12','Routine review 201: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(202,'P-0022','2026-11-13','Routine review 202: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(203,'P-0023','2026-11-14','Routine review 203: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(204,'P-0024','2026-11-15','Routine review 204: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(205,'P-0025','2026-11-16','Routine review 205: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(206,'P-0026','2026-11-17','Routine review 206: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(207,'P-0027','2026-11-18','Routine review 207: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(208,'P-0028','2026-11-19','Routine review 208: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(209,'P-0029','2026-11-20','Routine review 209: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(210,'P-0030','2026-11-21','Routine review 210: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(211,'P-0031','2026-11-22','Routine review 211: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(212,'P-0032','2026-11-23','Routine review 212: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(213,'P-0033','2026-11-24','Routine review 213: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(214,'P-0034','2026-11-25','Routine review 214: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(215,'P-0035','2026-11-26','Routine review 215: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(216,'P-0036','2026-11-27','Routine review 216: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(217,'P-0037','2026-11-28','Routine review 217: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(218,'P-0038','2026-11-29','Routine review 218: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(219,'P-0039','2026-11-30','Routine review 219: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(220,'P-0040','2026-12-01','Routine review 220: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(221,'P-0041','2026-12-02','Routine review 221: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(222,'P-0042','2026-12-03','Routine review 222: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(223,'P-0043','2026-12-04','Routine review 223: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(224,'P-0044','2026-12-05','Routine review 224: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(225,'P-0045','2026-12-06','Routine review 225: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(226,'P-0046','2026-12-07','Routine review 226: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(227,'P-0047','2026-12-08','Routine review 227: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(228,'P-0048','2026-12-09','Routine review 228: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(229,'P-0049','2026-12-10','Routine review 229: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(230,'P-0050','2026-12-11','Routine review 230: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(231,'P-0051','2026-12-12','Routine review 231: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(232,'P-0052','2026-12-13','Routine review 232: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(233,'P-0053','2026-12-14','Routine review 233: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(234,'P-0054','2026-12-15','Routine review 234: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(235,'P-0055','2026-12-16','Routine review 235: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(236,'P-0056','2026-12-17','Routine review 236: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(237,'P-0057','2026-12-18','Routine review 237: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(238,'P-0058','2026-12-19','Routine review 238: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(239,'P-0059','2026-12-20','Routine review 239: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(240,'P-0060','2026-12-21','Routine review 240: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(241,'P-0001','2026-12-22','Routine review 241: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(242,'P-0002','2026-12-23','Routine review 242: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(243,'P-0003','2026-12-24','Routine review 243: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(244,'P-0004','2026-12-25','Routine review 244: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(245,'P-0005','2026-10-26','Routine review 245: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(246,'P-0006','2026-10-27','Routine review 246: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(247,'P-0007','2026-10-28','Routine review 247: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(248,'P-0008','2026-10-29','Routine review 248: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(249,'P-0009','2026-10-30','Routine review 249: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(250,'P-0010','2026-10-31','Routine review 250: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(251,'P-0011','2026-11-01','Routine review 251: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(252,'P-0012','2026-11-02','Routine review 252: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(253,'P-0013','2026-11-03','Routine review 253: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(254,'P-0014','2026-11-04','Routine review 254: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(255,'P-0015','2026-11-05','Routine review 255: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(256,'P-0016','2026-11-06','Routine review 256: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(257,'P-0017','2026-11-07','Routine review 257: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(258,'P-0018','2026-11-08','Routine review 258: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(259,'P-0019','2026-11-09','Routine review 259: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(260,'P-0020','2026-11-10','Routine review 260: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(261,'P-0021','2026-11-11','Routine review 261: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(262,'P-0022','2026-11-12','Routine review 262: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(263,'P-0023','2026-11-13','Routine review 263: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(264,'P-0024','2026-11-14','Routine review 264: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(265,'P-0025','2026-11-15','Routine review 265: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(266,'P-0026','2026-11-16','Routine review 266: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(267,'P-0027','2026-11-17','Routine review 267: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(268,'P-0028','2026-11-18','Routine review 268: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(269,'P-0029','2026-11-19','Routine review 269: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(270,'P-0030','2026-11-20','Routine review 270: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(271,'P-0031','2026-11-21','Routine review 271: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(272,'P-0032','2026-11-22','Routine review 272: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(273,'P-0033','2026-11-23','Routine review 273: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(274,'P-0034','2026-11-24','Routine review 274: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(275,'P-0035','2026-11-25','Routine review 275: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(276,'P-0036','2026-11-26','Routine review 276: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(277,'P-0037','2026-11-27','Routine review 277: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(278,'P-0038','2026-11-28','Routine review 278: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(279,'P-0039','2026-11-29','Routine review 279: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(280,'P-0040','2026-11-30','Routine review 280: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(281,'P-0041','2026-12-01','Routine review 281: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(282,'P-0042','2026-12-02','Routine review 282: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(283,'P-0043','2026-12-03','Routine review 283: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(284,'P-0044','2026-12-04','Routine review 284: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(285,'P-0045','2026-12-05','Routine review 285: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(286,'P-0046','2026-12-06','Routine review 286: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(287,'P-0047','2026-12-07','Routine review 287: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(288,'P-0048','2026-12-08','Routine review 288: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(289,'P-0049','2026-12-09','Routine review 289: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(290,'P-0050','2026-12-10','Routine review 290: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(291,'P-0051','2026-12-11','Routine review 291: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(292,'P-0052','2026-12-12','Routine review 292: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(293,'P-0053','2026-12-13','Routine review 293: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(294,'P-0054','2026-12-14','Routine review 294: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(295,'P-0055','2026-12-15','Routine review 295: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(296,'P-0056','2026-12-16','Routine review 296: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(297,'P-0057','2026-12-17','Routine review 297: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(298,'P-0058','2026-12-18','Routine review 298: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(299,'P-0059','2026-12-19','Routine review 299: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(300,'P-0060','2026-12-20','Routine review 300: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(301,'P-0001','2026-12-21','Routine review 301: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(302,'P-0002','2026-12-22','Routine review 302: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(303,'P-0003','2026-12-23','Routine review 303: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(304,'P-0004','2026-12-24','Routine review 304: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(305,'P-0005','2026-12-25','Routine review 305: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(306,'P-0006','2026-10-26','Routine review 306: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(307,'P-0007','2026-10-27','Routine review 307: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(308,'P-0008','2026-10-28','Routine review 308: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(309,'P-0009','2026-10-29','Routine review 309: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(310,'P-0010','2026-10-30','Routine review 310: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(311,'P-0011','2026-10-31','Routine review 311: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(312,'P-0012','2026-11-01','Routine review 312: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(313,'P-0013','2026-11-02','Routine review 313: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(314,'P-0014','2026-11-03','Routine review 314: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(315,'P-0015','2026-11-04','Routine review 315: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(316,'P-0016','2026-11-05','Routine review 316: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(317,'P-0017','2026-11-06','Routine review 317: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(318,'P-0018','2026-11-07','Routine review 318: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(319,'P-0019','2026-11-08','Routine review 319: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(320,'P-0020','2026-11-09','Routine review 320: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(321,'P-0021','2026-11-10','Routine review 321: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(322,'P-0022','2026-11-11','Routine review 322: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(323,'P-0023','2026-11-12','Routine review 323: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(324,'P-0024','2026-11-13','Routine review 324: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(325,'P-0025','2026-11-14','Routine review 325: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(326,'P-0026','2026-11-15','Routine review 326: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(327,'P-0027','2026-11-16','Routine review 327: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(328,'P-0028','2026-11-17','Routine review 328: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(329,'P-0029','2026-11-18','Routine review 329: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(330,'P-0030','2026-11-19','Routine review 330: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(331,'P-0031','2026-11-20','Routine review 331: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(332,'P-0032','2026-11-21','Routine review 332: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(333,'P-0033','2026-11-22','Routine review 333: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(334,'P-0034','2026-11-23','Routine review 334: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(335,'P-0035','2026-11-24','Routine review 335: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(336,'P-0036','2026-11-25','Routine review 336: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(337,'P-0037','2026-11-26','Routine review 337: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(338,'P-0038','2026-11-27','Routine review 338: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(339,'P-0039','2026-11-28','Routine review 339: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(340,'P-0040','2026-11-29','Routine review 340: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(341,'P-0041','2026-11-30','Routine review 341: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(342,'P-0042','2026-12-01','Routine review 342: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(343,'P-0043','2026-12-02','Routine review 343: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(344,'P-0044','2026-12-03','Routine review 344: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(345,'P-0045','2026-12-04','Routine review 345: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(346,'P-0046','2026-12-05','Routine review 346: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(347,'P-0047','2026-12-06','Routine review 347: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(348,'P-0048','2026-12-07','Routine review 348: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(349,'P-0049','2026-12-08','Routine review 349: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(350,'P-0050','2026-12-09','Routine review 350: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(351,'P-0051','2026-12-10','Routine review 351: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(352,'P-0052','2026-12-11','Routine review 352: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(353,'P-0053','2026-12-12','Routine review 353: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(354,'P-0054','2026-12-13','Routine review 354: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(355,'P-0055','2026-12-14','Routine review 355: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(356,'P-0056','2026-12-15','Routine review 356: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(357,'P-0057','2026-12-16','Routine review 357: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(358,'P-0058','2026-12-17','Routine review 358: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(359,'P-0059','2026-12-18','Routine review 359: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(360,'P-0060','2026-12-19','Routine review 360: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(361,'P-0001','2026-12-20','Routine review 361: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(362,'P-0002','2026-12-21','Routine review 362: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(363,'P-0003','2026-12-22','Routine review 363: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(364,'P-0004','2026-12-23','Routine review 364: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(365,'P-0005','2026-12-24','Routine review 365: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(366,'P-0006','2026-12-25','Routine review 366: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(367,'P-0007','2026-10-26','Routine review 367: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(368,'P-0008','2026-10-27','Routine review 368: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(369,'P-0009','2026-10-28','Routine review 369: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(370,'P-0010','2026-10-29','Routine review 370: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(371,'P-0011','2026-10-30','Routine review 371: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(372,'P-0012','2026-10-31','Routine review 372: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(373,'P-0013','2026-11-01','Routine review 373: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(374,'P-0014','2026-11-02','Routine review 374: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(375,'P-0015','2026-11-03','Routine review 375: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(376,'P-0016','2026-11-04','Routine review 376: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(377,'P-0017','2026-11-05','Routine review 377: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(378,'P-0018','2026-11-06','Routine review 378: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(379,'P-0019','2026-11-07','Routine review 379: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(380,'P-0020','2026-11-08','Routine review 380: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(381,'P-0021','2026-11-09','Routine review 381: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(382,'P-0022','2026-11-10','Routine review 382: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(383,'P-0023','2026-11-11','Routine review 383: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(384,'P-0024','2026-11-12','Routine review 384: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(385,'P-0025','2026-11-13','Routine review 385: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(386,'P-0026','2026-11-14','Routine review 386: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(387,'P-0027','2026-11-15','Routine review 387: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(388,'P-0028','2026-11-16','Routine review 388: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(389,'P-0029','2026-11-17','Routine review 389: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(390,'P-0030','2026-11-18','Routine review 390: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(391,'P-0031','2026-11-19','Routine review 391: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(392,'P-0032','2026-11-20','Routine review 392: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(393,'P-0033','2026-11-21','Routine review 393: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(394,'P-0034','2026-11-22','Routine review 394: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(395,'P-0035','2026-11-23','Routine review 395: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(396,'P-0036','2026-11-24','Routine review 396: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(397,'P-0037','2026-11-25','Routine review 397: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(398,'P-0038','2026-11-26','Routine review 398: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(399,'P-0039','2026-11-27','Routine review 399: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL),
(400,'P-0040','2026-11-28','Routine review 400: blood pressure and medication adherence','scheduled',1,1,'2026-11-25T15:20:48.379Z',NULL,NULL,NULL,0,NULL);
/*!40000 ALTER TABLE `follow_ups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patients`
--

DROP TABLE IF EXISTS `patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `patients` (
  `id` varchar(50) NOT NULL,
  `name` varchar(200) NOT NULL,
  `category` enum('student','employee') NOT NULL DEFAULT 'student',
  `contact_number` varchar(40) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `sex` enum('female','male','other') DEFAULT NULL,
  `archived` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patients`
--

LOCK TABLES `patients` WRITE;
/*!40000 ALTER TABLE `patients` DISABLE KEYS */;
INSERT INTO `patients` VALUES
('P-0001','Fictional Patient 1','student','+63 900 000 0001',NULL,NULL,0),
('P-0002','Fictional Patient 2','student','+63 900 000 0002',NULL,NULL,0),
('P-0003','Fictional Patient 3','employee','+63 900 000 0003',NULL,NULL,0),
('P-0004','Fictional Patient 4','student','+63 900 000 0004',NULL,NULL,0),
('P-0005','Fictional Patient 5','student','+63 900 000 0005',NULL,NULL,0),
('P-0006','Fictional Patient 6','employee','+63 900 000 0006',NULL,NULL,0),
('P-0007','Fictional Patient 7','student','+63 900 000 0007',NULL,NULL,0),
('P-0008','Fictional Patient 8','student','+63 900 000 0008',NULL,NULL,0),
('P-0009','Fictional Patient 9','employee','+63 900 000 0009',NULL,NULL,0),
('P-0010','Fictional Patient 10','student','+63 900 000 0010',NULL,NULL,0),
('P-0011','Fictional Patient 11','student','+63 900 000 0011',NULL,NULL,0),
('P-0012','Fictional Patient 12','employee','+63 900 000 0012',NULL,NULL,0),
('P-0013','Fictional Patient 13','student','+63 900 000 0013',NULL,NULL,0),
('P-0014','Fictional Patient 14','student','+63 900 000 0014',NULL,NULL,0),
('P-0015','Fictional Patient 15','employee','+63 900 000 0015',NULL,NULL,0),
('P-0016','Fictional Patient 16','student','+63 900 000 0016',NULL,NULL,0),
('P-0017','Fictional Patient 17','student','+63 900 000 0017',NULL,NULL,0),
('P-0018','Fictional Patient 18','employee','+63 900 000 0018',NULL,NULL,0),
('P-0019','Fictional Patient 19','student','+63 900 000 0019',NULL,NULL,0),
('P-0020','Fictional Patient 20','student','+63 900 000 0020',NULL,NULL,0),
('P-0021','Fictional Patient 21','employee','+63 900 000 0021',NULL,NULL,0),
('P-0022','Fictional Patient 22','student','+63 900 000 0022',NULL,NULL,0),
('P-0023','Fictional Patient 23','student','+63 900 000 0023',NULL,NULL,0),
('P-0024','Fictional Patient 24','employee','+63 900 000 0024',NULL,NULL,0),
('P-0025','Fictional Patient 25','student','+63 900 000 0025',NULL,NULL,0),
('P-0026','Fictional Patient 26','student','+63 900 000 0026',NULL,NULL,0),
('P-0027','Fictional Patient 27','employee','+63 900 000 0027',NULL,NULL,0),
('P-0028','Fictional Patient 28','student','+63 900 000 0028',NULL,NULL,0),
('P-0029','Fictional Patient 29','student','+63 900 000 0029',NULL,NULL,0),
('P-0030','Fictional Patient 30','employee','+63 900 000 0030',NULL,NULL,0),
('P-0031','Fictional Patient 31','student','+63 900 000 0031',NULL,NULL,0),
('P-0032','Fictional Patient 32','student','+63 900 000 0032',NULL,NULL,0),
('P-0033','Fictional Patient 33','employee','+63 900 000 0033',NULL,NULL,0),
('P-0034','Fictional Patient 34','student','+63 900 000 0034',NULL,NULL,0),
('P-0035','Fictional Patient 35','student','+63 900 000 0035',NULL,NULL,0),
('P-0036','Fictional Patient 36','employee','+63 900 000 0036',NULL,NULL,0),
('P-0037','Fictional Patient 37','student','+63 900 000 0037',NULL,NULL,0),
('P-0038','Fictional Patient 38','student','+63 900 000 0038',NULL,NULL,0),
('P-0039','Fictional Patient 39','employee','+63 900 000 0039',NULL,NULL,0),
('P-0040','Fictional Patient 40','student','+63 900 000 0040',NULL,NULL,0),
('P-0041','Fictional Patient 41','student','+63 900 000 0041',NULL,NULL,0),
('P-0042','Fictional Patient 42','employee','+63 900 000 0042',NULL,NULL,0),
('P-0043','Fictional Patient 43','student','+63 900 000 0043',NULL,NULL,0),
('P-0044','Fictional Patient 44','student','+63 900 000 0044',NULL,NULL,0),
('P-0045','Fictional Patient 45','employee','+63 900 000 0045',NULL,NULL,0),
('P-0046','Fictional Patient 46','student','+63 900 000 0046',NULL,NULL,0),
('P-0047','Fictional Patient 47','student','+63 900 000 0047',NULL,NULL,0),
('P-0048','Fictional Patient 48','employee','+63 900 000 0048',NULL,NULL,0),
('P-0049','Fictional Patient 49','student','+63 900 000 0049',NULL,NULL,0),
('P-0050','Fictional Patient 50','student','+63 900 000 0050',NULL,NULL,0),
('P-0051','Fictional Patient 51','employee','+63 900 000 0051',NULL,NULL,0),
('P-0052','Fictional Patient 52','student','+63 900 000 0052',NULL,NULL,0),
('P-0053','Fictional Patient 53','student','+63 900 000 0053',NULL,NULL,0),
('P-0054','Fictional Patient 54','employee','+63 900 000 0054',NULL,NULL,0),
('P-0055','Fictional Patient 55','student','+63 900 000 0055',NULL,NULL,0),
('P-0056','Fictional Patient 56','student','+63 900 000 0056',NULL,NULL,0),
('P-0057','Fictional Patient 57','employee','+63 900 000 0057',NULL,NULL,0),
('P-0058','Fictional Patient 58','student','+63 900 000 0058',NULL,NULL,0),
('P-0059','Fictional Patient 59','student','+63 900 000 0059',NULL,NULL,0),
('P-0060','Fictional Patient 60','employee','+63 900 000 0060',NULL,NULL,0);
/*!40000 ALTER TABLE `patients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reminder_alerts`
--

DROP TABLE IF EXISTS `reminder_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reminder_alerts` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `job_id` int(11) NOT NULL,
  `role` varchar(20) NOT NULL,
  `message` varchar(400) NOT NULL,
  `created_at` varchar(30) NOT NULL,
  `read_at` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_alert_role` (`role`,`read_at`),
  KEY `fk_alert_job` (`job_id`),
  CONSTRAINT `fk_alert_job` FOREIGN KEY (`job_id`) REFERENCES `reminder_jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reminder_alerts`
--

LOCK TABLES `reminder_alerts` WRITE;
/*!40000 ALTER TABLE `reminder_alerts` DISABLE KEYS */;
/*!40000 ALTER TABLE `reminder_alerts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reminder_attempts`
--

DROP TABLE IF EXISTS `reminder_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reminder_attempts` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `job_id` int(11) NOT NULL,
  `attempt_no` int(11) NOT NULL,
  `correlation_id` char(32) NOT NULL,
  `started_at` varchar(30) NOT NULL,
  `duration_ms` int(11) NOT NULL DEFAULT 0,
  `outcome` varchar(20) NOT NULL,
  `http_status` int(11) DEFAULT NULL,
  `error_code` varchar(60) DEFAULT NULL,
  `error_text` varchar(500) DEFAULT NULL,
  `actor_note` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_att_job` (`job_id`,`attempt_no`),
  CONSTRAINT `fk_att_job` FOREIGN KEY (`job_id`) REFERENCES `reminder_jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reminder_attempts`
--

LOCK TABLES `reminder_attempts` WRITE;
/*!40000 ALTER TABLE `reminder_attempts` DISABLE KEYS */;
/*!40000 ALTER TABLE `reminder_attempts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reminder_jobs`
--

DROP TABLE IF EXISTS `reminder_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reminder_jobs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `kind` varchar(40) NOT NULL,
  `follow_up_id` int(11) NOT NULL,
  `follow_up_version` int(11) NOT NULL,
  `idempotency_key` char(64) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'queued',
  `attempts` int(11) NOT NULL DEFAULT 0,
  `max_attempts` int(11) NOT NULL DEFAULT 4,
  `correlation_id` char(32) NOT NULL,
  `next_run_at` bigint(20) NOT NULL,
  `last_error_code` varchar(60) DEFAULT NULL,
  `last_error_text` varchar(500) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` varchar(30) NOT NULL,
  `updated_at` varchar(30) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_idem` (`idempotency_key`),
  UNIQUE KEY `uq_job_corr` (`correlation_id`),
  KEY `idx_job_poll` (`status`,`next_run_at`),
  KEY `fk_job_fu` (`follow_up_id`),
  CONSTRAINT `fk_job_fu` FOREIGN KEY (`follow_up_id`) REFERENCES `follow_ups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reminder_jobs`
--

LOCK TABLES `reminder_jobs` WRITE;
/*!40000 ALTER TABLE `reminder_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `reminder_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `secure_inbox`
--

DROP TABLE IF EXISTS `secure_inbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `secure_inbox` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `message_id` char(36) NOT NULL,
  `sender` varchar(40) NOT NULL,
  `recipient` varchar(40) NOT NULL,
  `key_id` varchar(40) NOT NULL,
  `payload_sha256` char(64) NOT NULL,
  `plaintext_bytes` int(11) NOT NULL,
  `issued_at` datetime(3) NOT NULL,
  `received_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inbox_message` (`message_id`),
  KEY `idx_inbox_received` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `secure_inbox`
--

LOCK TABLES `secure_inbox` WRITE;
/*!40000 ALTER TABLE `secure_inbox` DISABLE KEYS */;
/*!40000 ALTER TABLE `secure_inbox` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `secure_outbox`
--

DROP TABLE IF EXISTS `secure_outbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `secure_outbox` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `follow_up_id` bigint(20) DEFAULT NULL,
  `message_id` char(36) NOT NULL,
  `sender` varchar(40) NOT NULL,
  `recipient` varchar(40) NOT NULL,
  `alg` varchar(32) NOT NULL,
  `enc` varchar(32) NOT NULL,
  `sig` varchar(32) NOT NULL,
  `key_id` varchar(40) NOT NULL,
  `plaintext_bytes` int(11) NOT NULL,
  `ciphertext_bytes` int(11) NOT NULL,
  `payload_sha256` char(64) NOT NULL,
  `status` enum('sealed','delivered','rejected','failed') NOT NULL DEFAULT 'sealed',
  `http_status` int(11) DEFAULT NULL,
  `error_code` varchar(48) DEFAULT NULL,
  `detail` varchar(400) DEFAULT NULL,
  `issued_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outbox_message` (`message_id`),
  KEY `idx_outbox_followup` (`follow_up_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `secure_outbox`
--

LOCK TABLES `secure_outbox` WRITE;
/*!40000 ALTER TABLE `secure_outbox` DISABLE KEYS */;
/*!40000 ALTER TABLE `secure_outbox` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `token_hash` char(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `csrf_token` char(64) NOT NULL,
  `expires_at` bigint(20) NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `fk_session_user` (`user_id`),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES
('0931c26756dd566e62a73e5400b7da0cb1066f504f65dd001630c8cc5aa32058',1,'c7932c0157212c5a80092694d3e03c997423447d4542d0c2d60172b0902ddd4c',1795648851503),
('1134261cfcfb272381e4f4fd0fe8f3b2e4953372dcb5c367ce24202d8483bb48',1,'51580e366cb12e07aaa8df3b6bc5e7ffdebe41d1a417b9098f72096838d3f2f6',1795648851585),
('1753c8058e0578becfdb01d575b57f3ce38e612a1ec14ce21eaf31aa9ca8b364',1,'d449535194a21da20c333d18d88e3ba431885eb77073f1ebb79ec2f324e94766',1795648851463),
('17c90e132b13b1831397dbb86851b9af2c8362f5b24ad3a152045d2aa827f757',1,'da1104b5a681dd6d77b7809440f0273ccfda656a942600b5d834e9e07757dd55',1795648848752),
('1fd5a4d74d121d101ae9ad7e2da8691781b7ae9313c4797922d3fcd989c72e65',1,'7401a962dfd1bbb0ea183b0a9d8a322cac49feb71a9273191a827629e7e9a4a0',1795648851706),
('2d8173983809e5869a5bd8d18e3220204e4c3d8cbd0ff75749e839c7acb08d25',1,'b623cf88e7ae4ca131e3bc00bbfc5b8ee7bd5ad98b79aeff152a8a6cae2ee072',1795648851828),
('4095086ba465b8f395418e68b9c9fa991d1c20114d7569bf6d0b737293d985bf',1,'96c197d8ab3d7916ba221606331f0666b8b5e9af5f2483db5328b7694affcf9a',1795648851870),
('459f3da0ea39a815b659329616dac9b2c372e4630eadf96ef2477ced30d2b7fc',1,'9b8d6a8335b32ac7200646a4cbbde56571d4238029720f0ed7308099d5821200',1795648851789),
('705c1a163697c970a5e5e2541490b3480baf5f588a60ddc87ca4a9a6d3c89644',1,'7413a33f25d9b444f0589330fd9da0e326f60a8f1140713ee9e90883d32f4903',1795648852031),
('73df34cfde56f70c67aecbf7f93354dfd284d9c76e0f2746c7d615ac95994255',1,'5ed2432a9831f0b0b36607ef63a9f4c8870c5d55dbee777316810646943e4363',1795648851625),
('773219b614fd1f2245d033facb489db62750274c4a07ed4e05a7a22aea1c12cb',1,'00e42a35df5442613e9e5a62e05b27bb697293a3f3097f812bddedfbcac36855',1795648852112),
('7f576372ed6d9a26f7045a09505b7ca07d21e2add6c9f963cd6c0bce2fef4cdc',1,'5fcd1fcbfc803232e1dedc525843dba92bb3a232149ffa6df70f7c9b7de49f07',1795648875525),
('7f6cd4dc7e33b69632b8e82370f6a1b454d205e2d9432ad9a81c4187d61500c4',1,'98b9228afa541621c90833364809520a228dac7196c3674b92567a3f310382d0',1795648852194),
('8165758944de05ee8694b75f774a3b4a19c7c99c47a6854de9991a4a3d201f3f',1,'1cabb1899a03088747d94d7ba2f46e0fd0fb90ea1aa7431a990dcd6e025e8dcb',1795648851382),
('823a3e86c43e94adc43e1fa02372df9d361bebf4664b54ef4605104ccc24d1fc',1,'1a7a73dcab276ba4179553be770b3c6244f62e974bfe9972f2efc8ab6fd8bb62',1795648852154),
('8ba8b87d78e1fb27188ff69e8e14b287da0ef8a5d91cc0f8c01d8d1ebabb4afa',1,'7dd3048844a8ef95206436388451ca96ebd31b54c4d42853bc8c85edb5813905',1795648851748),
('a9277e53b838e606b90a10315fde51fc96811794410ed16b0d68efdda65dc92e',1,'b3bf35af4bf34153f3920984263c819a6ea7817bcb94cc4e09ec1e9c4851894b',1795648851544),
('cae8d78decefecfc5c913e9bde5b18612b1690c200d18da9d42f3c5f0cd8e901',1,'97c5e4f988b1554f1fdf641fd6c14a47d139ca957a0b8b3d993a693dbcef3aab',1795648851423),
('cb4aeefc45f14913b907e64d2d4c8e67dd6e20a331149322f03194a4dcd4c874',1,'85d1134509226ba73c850c5915caf62a8f9781cea84b7f4ea98c42f00e6d479a',1795648851666),
('d816c6371f3dac53905638bb31d1809eed826fdb1eb85bf7e6ddff6d65fb3ccd',1,'3e4561dc766e615c1b23a7df214f1e7c7b9f53702e7a6ae96f9d81716baf951c',1795648851950),
('e26f1e0d1c0688a276d6e3e0a997861ec134491cb3a06b6ecec7b07fbc1a6d62',1,'7682db6a59629c81547d2edba4cda5d1ac54ed28b338efa7ca6deb4e5616b386',1795648851911),
('e9266b7374217420eb6e3f7eac512f23880654410131bdee5dfca28ff63ec0ea',1,'ad89c35788d2b1527c1ca6f555b4aab3569220497ae009027cf87a18293d8a60',1795648852073),
('fd2f200066fe86e99707cb5bf78a40cb8a54def418755b30d9d02534d0c0ab7a',1,'10bc6586b09a7437aaa6c04b132ff788afbb3b561c0ff305f1d710650a433ded',1795648851990);
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `name` varchar(200) NOT NULL,
  `role` enum('nurse','doctor') NOT NULL,
  `password_hash` varchar(200) NOT NULL,
  `active` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'doctor1','Fictional Doctor','doctor','0ef0fead920ac376871cd6e421ef9b86:3b3301d38d05419dbd8039dc0a9528e622d919b3d22389ff34eaf282e63665a2c9f8b3f6f1eedb0e263ec0dfa898fb88ce27d0edef1cf02a5f58226c40b4bb80',1),
(2,'nurse1','Fictional Nurse','nurse','7f8bcd6f73a2792cda29b3c317307229:c90a689ff7df066f5b497fa25e97b62c6125824e5f7e75d7126b215e95928c33f33454280974ce6410701d8d0dc7220264df6ebf51a9ac8cbef2edbad723a801',1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'clinic_followup_m16'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-25 23:21:46
